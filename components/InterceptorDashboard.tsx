import { sendToBackground } from "@plasmohq/messaging"
import { faFilter, faRotate, faDownload, faFileZipper, faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { useEffect, useState,useMemo } from "react"

import { indexDB, type TimedObject, type TimedObjectWithCanSendToCA } from "~utils/IndexDB"
import { DevLog } from "~utils/devUtils"
import posthog from "~core/posthog"
import { getUser } from "~utils/dbUtils"
import { downloadDataAsJson, downloadDataByOriginator, downloadAsZip } from "~utils/zipUtils"
import "~/prod.css"
import { TwitterDataMapper } from "~InterceptorModules/utils/TwitterDataMapper"
import { supabase } from "~core/supabase"

// --- Import charting library at the top of your file:
  // import { Bar } from "react-chartjs-2"
  // import { Chart, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js"
  // Chart.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)
  import { Bar } from "react-chartjs-2"
  import {
    Chart as ChartJS,
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    TimeScale,
  } from "chart.js"
  import "chartjs-adapter-date-fns"


type GroupedData = {
  [key: string]: TimedObjectWithCanSendToCA[]
}

// List of error reasons that can be reprocessed
const REPROCESSABLE_ERRORS = [
  "Error processing tweet.",
  "Error uploading to Supabase"
]

// New types for the updated response structure
type PaginationInfo = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

type OverviewStats = {
  typeCounts: Record<string, number>
  reasonCounts: Record<string, number>
  canSendCounts: Record<string, number>
  reprocessableCountByReason: Record<string, number>
  totalRecords: number
}

type BackgroundResponse = {
  success: boolean
  data: TimedObjectWithCanSendToCA[]
  pagination: PaginationInfo
  overview: OverviewStats
  error?: string
}

const InterceptorDashboard = () => {
  const [data, setData] = useState<TimedObjectWithCanSendToCA[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedType, setSelectedType] = useState<string>("all")
  const [selectedCanSendStatus, setSelectedCanSendStatus] = useState<string>("all")
  const [selectedReason, setSelectedReason] = useState<string>("all")
  const [error, setError] = useState<string | null>(null)
  const [processingReasons, setProcessingReasons] = useState<Set<string>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadType, setDownloadType] = useState<string | null>(null)
  
  // New state for pagination and overview stats
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, pageSize: 50, totalCount: 0, totalPages: 0 })
  const [overview, setOverview] = useState<OverviewStats>({
    typeCounts: {},
    reasonCounts: {},
    canSendCounts: {},
    reprocessableCountByReason: {},
    totalRecords: 0
  })
  
  // New state for progress tracking
  const [progressInfo, setProgressInfo] = useState<{
    operation: string;
    current: number;
    total: number;
    percent: number;
  } | null>(null)

  ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend, TimeScale)

  const groupBy = (arr, fn) => {
    return arr.reduce((acc, item) => {
      const key = fn(item)
      if (!acc[key]) acc[key] = []
      acc[key].push(item)
      return acc
    }, {})
  }

  const getWeekNumber = (dateString: string) => {
    const date = new Date(dateString)
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
    const pastDaysOfYear = (date.valueOf() - firstDayOfYear.valueOf()) / 86400000
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
  }

  const StatsComponent = () => {
    const [tab, setTab] = useState<"daily" | "weekly" | "monthly">("daily")
    const [showAggregated, setShowAggregated] = useState(true)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    
    // Cache for different time periods - any fetch updates all periods with filtered data
    // Strategy: Always fetch the largest period needed to maximize cache efficiency
    const [statsCache, setStatsCache] = useState<{
      daily: { data: {date: string, type: string, count: number}[], timestamp: number, fetchedPeriod: "daily" | "weekly" | "monthly" } | null,
      weekly: { data: {date: string, type: string, count: number}[], timestamp: number, fetchedPeriod: "daily" | "weekly" | "monthly" } | null,
      monthly: { data: {date: string, type: string, count: number}[], timestamp: number, fetchedPeriod: "daily" | "weekly" | "monthly" } | null,
    }>({
      daily: null,
      weekly: null,
      monthly: null,
    })

    // Cache expiration times (in milliseconds)
    const CACHE_EXPIRY = {
      daily: 15 * 60 * 1000,   // 15 minutes
      weekly: 2 * 60 * 60 * 1000,  // 2 hours
      monthly: 6 * 60 * 60 * 1000, // 6 hours
    }

    // Days back for each tab
    const DAYS_BACK = {
      daily: 7,
      weekly: 90,   // ~13 weeks
      monthly: 365, // ~12 months
    }

    // Fetch stats for a specific time period
    const fetchStats = async (period: "daily" | "weekly" | "monthly") => {
      try {
        setIsLoading(true)
        setError(null)
        
        const response = await supabase.schema("tes")
          .rpc("get_user_intercepted_stats", { days_back: DAYS_BACK[period] })
          .select("*")
          .returns<{date: string, type: string, count: number}[]>()

        if (response.error) {
          throw new Error(response.error.message)
        }

        const newCacheEntry = {
          data: response.data || [],
          timestamp: Date.now(),
          fetchedPeriod: period
        }

        // Update cache for this period
        setStatsCache(prev => ({
          ...prev,
          [period]: newCacheEntry
        }))

        // Smart caching: any fetch updates all other periods with their respective time-filtered data
        if (response.data) {
          const now = Date.now()
          const today = new Date()
          
          // Calculate date thresholds for each period
          const sevenDaysAgo = new Date()
          sevenDaysAgo.setDate(today.getDate() - 7)
          
          const ninetyDaysAgo = new Date()
          ninetyDaysAgo.setDate(today.getDate() - 90)
          
          // Filter data for each time period
          const dailyData = response.data.filter(item => {
            const itemDate = new Date(item.date)
            return itemDate >= sevenDaysAgo
          })
          
          const weeklyData = response.data.filter(item => {
            const itemDate = new Date(item.date)
            return itemDate >= ninetyDaysAgo
          })
          
          const monthlyData = response.data // All data for monthly view
          
          // Update all caches with their respective filtered data
          setStatsCache(prev => ({
            daily: { data: dailyData, timestamp: now, fetchedPeriod: period },
            weekly: { data: weeklyData, timestamp: now, fetchedPeriod: period },
            monthly: { data: monthlyData, timestamp: now, fetchedPeriod: period }
          }))
        }

        DevLog(`Fetched stats for ${period}:`, response.data?.length || 0, "items")
        
      } catch (error) {
        DevLog("Error fetching stats:", error, "error")
        setError(`Failed to load ${period} stats: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    // Check if cache is valid (both time-wise and data scope-wise)
    const isCacheValid = (period: "daily" | "weekly" | "monthly") => {
      const cache = statsCache[period]
      if (!cache) return false
      
      // Check if cache is not expired
      const now = Date.now()
      const age = now - cache.timestamp
      const isNotExpired = age < CACHE_EXPIRY[period]
      
      // Check if the cached data has sufficient scope for the requested period
      const hasSufficientScope = () => {
        switch (period) {
          case "daily":
            // Daily data can be satisfied by daily, weekly, or monthly fetches
            return true
          case "weekly":
            // Weekly data requires weekly or monthly fetch (not daily)
            return cache.fetchedPeriod === "weekly" || cache.fetchedPeriod === "monthly"
          case "monthly":
            // Monthly data requires monthly fetch
            return cache.fetchedPeriod === "monthly"
          default:
            return false
        }
      }
      
      const isValid = isNotExpired && hasSufficientScope()
      DevLog(`Cache validation for ${period}: expired=${!isNotExpired}, insufficient_scope=${!hasSufficientScope()}, valid=${isValid}`)
      
      return isValid
    }

    // Get stats for current tab, fetching if needed
    const getStatsForTab = async (period: "daily" | "weekly" | "monthly", forceRefresh = false) => {
      if (!forceRefresh && isCacheValid(period)) {
        DevLog(`Using cached ${period} stats`)
        return statsCache[period]!.data
      }

      // Determine the optimal fetch strategy - always fetch the largest period needed
      // to maximize cache efficiency
      let fetchPeriod = period
      
      if (!forceRefresh) {
        // If we need daily or weekly data and don't have valid monthly cache, fetch monthly
        if ((period === "daily" || period === "weekly") && !isCacheValid("monthly")) {
          fetchPeriod = "monthly"
          DevLog(`Cache miss for ${period}, fetching monthly data to populate all caches`)
        } else if (period === "daily" && !isCacheValid("weekly")) {
          fetchPeriod = "weekly"
          DevLog(`Cache miss for ${period}, fetching weekly data to populate daily cache`)
        } else {
          DevLog(`Cache miss for ${period}, fetching ${period} data`)
        }
      } else {
        DevLog(`Force refresh for ${period}`)
      }

      await fetchStats(fetchPeriod)
      return statsCache[period]?.data || []
    }

    // Force refresh current tab data
    const handleForceRefresh = async () => {
      DevLog(`Force refreshing ${tab} data`)
      await getStatsForTab(tab, true)
    }

    // Effect to fetch data when tab changes
    useEffect(() => {
      getStatsForTab(tab)
    }, [tab])

    // Get current stats based on selected tab
    const currentStats = statsCache[tab]?.data || []

    // Prepare data for each tab
    const { dailyData, weeklyData, monthlyData, dailyLabels, weeklyLabels, monthlyLabels, typeList } = useMemo(() => {
      if (!currentStats || currentStats.length === 0) {
        return {
          dailyData: [],
          weeklyData: [],
          monthlyData: [],
          dailyLabels: [],
          weeklyLabels: [],
          monthlyLabels: [],
          typeList: [],
        }
      }

      // Get all unique types
      const typeSet = new Set(currentStats.map(s => s.type))
      const typeList = Array.from(typeSet)

      // --- DAILY (last 7 days) ---
      // Get last 7 days (including today)
      const today = new Date()
      const last7Days = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(today)
        d.setDate(today.getDate() - (6 - i))
        return d.toISOString().slice(0, 10)
      })

      // For each type, build a data array for the last 7 days
      const dailyData = typeList.map(type =>
        last7Days.map(date =>
          currentStats.filter(s => s.type === type && s.date === date).reduce((sum, s) => sum + s.count, 0)
        )
      )
      const dailyLabels = last7Days

      // --- WEEKLY (group by week number in the year) ---
      // Group stats by year+week
      const weekGroups = groupBy(currentStats, s => {
        const d = new Date(s.date)
        return `${d.getFullYear()}-W${getWeekNumber(s.date)}`
      })
      const sortedWeeks = Object.keys(weekGroups).sort()
      const weeklyData = typeList.map(type =>
        sortedWeeks.map(week =>
          weekGroups[week].filter((s: any) => s.type === type).reduce((sum: number, s: any) => sum + s.count, 0)
        )
      )
      const weeklyLabels = sortedWeeks

      // --- MONTHLY (group by year-month) ---
      const monthGroups = groupBy(currentStats, s => s.date.slice(0, 7))
      const sortedMonths = Object.keys(monthGroups).sort()
      const monthlyData = typeList.map(type =>
        sortedMonths.map(month =>
          monthGroups[month].filter((s: any) => s.type === type).reduce((sum: number, s: any) => sum + s.count, 0)
        )
      )
      const monthlyLabels = sortedMonths

      return {
        dailyData,
        weeklyData,
        monthlyData,
        dailyLabels,
        weeklyLabels,
        monthlyLabels,
        typeList,
      }
    }, [currentStats])

    // Chart.js datasets
    const getDatasets = (dataArr: number[][], typeList: string[]) => {
      if (showAggregated) {
        // Sum all types for each time period
        const aggregatedData = dataArr[0]?.map((_, periodIndex) =>
          dataArr.reduce((sum, typeData) => sum + typeData[periodIndex], 0)
        ) || []
        
        return [{
          label: "Total Records",
          data: aggregatedData,
          backgroundColor: "#2563eb",
          borderRadius: 2,
          maxBarThickness: 20,
        }]
      } else {
        // Show each type separately
        const colors = [
          "#2563eb", "#16a34a", "#f59e42", "#e11d48", "#a21caf", "#0e7490", "#facc15", "#f472b6"
        ]
        return typeList.map((type, idx) => ({
          label: type.replace(/-/g, " "),
          data: dataArr[idx],
          backgroundColor: colors[idx % colors.length],
          borderRadius: 2,
          maxBarThickness: 16,
        }))
      }
    }

    let chartData, chartLabels, chartTitle
    if (tab === "daily") {
      chartData = {
        labels: dailyLabels,
        datasets: getDatasets(dailyData, typeList),
      }
      chartLabels = dailyLabels
      chartTitle = "Last 7 Days"
    } else if (tab === "weekly") {
      chartData = {
        labels: weeklyLabels,
        datasets: getDatasets(weeklyData, typeList),
      }
      chartLabels = weeklyLabels
      chartTitle = "Weekly"
    } else {
      chartData = {
        labels: monthlyLabels,
        datasets: getDatasets(monthlyData, typeList),
      }
      chartLabels = monthlyLabels
      chartTitle = "Monthly"
    }

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index' as const,
      },
      plugins: {
        legend: { 
          display: !showAggregated, 
          position: "top" as const,
          labels: {
            boxWidth: 14,
            padding: 12,
            font: { size: 13 }
          }
        },
        title: { display: false },
        tooltip: { 
          enabled: true,
          external: null,
          mode: "index" as const, 
          intersect: false,
          position: 'nearest' as const,
          titleFont: { size: 13, weight: 'bold' as const },
          bodyFont: { size: 12 },
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          titleColor: '#ffffff',
          bodyColor: '#ffffff',
          borderColor: '#6b7280',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          displayColors: true,
          bodySpacing: 4,
          titleSpacing: 4,
          footerSpacing: 4,
          caretSize: 6,
          caretPadding: 8,
          callbacks: {
            title: function(tooltipItems) {
              const label = tooltipItems[0].label
              // Format different time periods
              if (tab === "daily") {
                // Convert YYYY-MM-DD to more readable format
                const date = new Date(label)
                return date.toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric' 
                })
              } else if (tab === "weekly") {
                // Format week labels (e.g., "2025-W10" -> "Week 10, 2025")
                const match = label.match(/(\d{4})-W(\d+)/)
                if (match) {
                  return `Week ${parseInt(match[2])}, ${match[1]}`
                }
                return label
              } else if (tab === "monthly") {
                // Format month labels (e.g., "2025-03" -> "March 2025")
                const date = new Date(label + '-01')
                return date.toLocaleDateString('en-US', { 
                  month: 'long', 
                  year: 'numeric' 
                })
              }
              return label
            },
            label: function(context) {
              const value = context.parsed.y
              const datasetLabel = context.dataset.label || ''
              
              // Format the value with commas
              const formattedValue = value.toLocaleString()
              
              // Return formatted label
              return `${datasetLabel}: ${formattedValue} records`
            }
          }
        },
      },
      scales: {
        x: {
          title: { display: false },
          grid: { display: false },
          ticks: { font: { size: 12 } }
        },
        y: {
          beginAtZero: true,
          title: { display: false },
          grid: { color: "#f3f4f6" },
          ticks: { font: { size: 12 } }
        },
      },
    }

    if (error) {
      return (
        <div className="bg-gray-50 p-3 rounded-lg mb-4">
          <h3 className="text-sm font-medium mb-2">Activity Stats</h3>
          <p className="text-xs text-red-500">{error}</p>
        </div>
      )
    }

    if (!currentStats || currentStats.length === 0) {
      return (
        <div className="bg-gray-50 p-3 rounded-lg mb-4">
          <h3 className="text-sm font-medium mb-2">Activity Stats</h3>
          <p className="text-xs text-gray-500">
            {isLoading ? "Loading..." : "No stats available"}
          </p>
        </div>
      )
    }

    return (
      <div className="bg-gray-50 p-3 rounded-lg mb-4 relative" style={{ zIndex: 1 }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Activity Stats</h3>
          <div className="flex items-center space-x-6">
            {statsCache[tab] && (
              <button
                onClick={handleForceRefresh}
                disabled={isLoading}
                className="text-xs text-gray-500 hover:text-blue-600 transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="Click to force refresh"
              >
                {isCacheValid(tab) ? "📊 Cached" : isLoading ? "🔄 Loading..." : "⏰ Expired"}
              </button>
            )}
            <label className="flex items-center text-xs ml-4">
              <input
                type="checkbox"
                checked={showAggregated}
                onChange={(e) => setShowAggregated(e.target.checked)}
                className="mr-1 w-3 h-3"
              />
              Aggregate
            </label>
          </div>
        </div>
        <div className="flex space-x-1 mb-3">
          <button
            className={`px-2 py-1 text-xs rounded ${tab === "daily" ? "bg-blue-600 text-white" : "bg-white border text-gray-700"}`}
            onClick={() => setTab("daily")}
          >
            7 Days
          </button>
          <button
            className={`px-2 py-1 text-xs rounded ${tab === "weekly" ? "bg-blue-600 text-white" : "bg-white border text-gray-700"}`}
            onClick={() => setTab("weekly")}
          >
            Weekly
          </button>
          <button
            className={`px-2 py-1 text-xs rounded ${tab === "monthly" ? "bg-blue-600 text-white" : "bg-white border text-gray-700"}`}
            onClick={() => setTab("monthly")}
          >
            Monthly
          </button>
        </div>
        <div className="text-center mb-2">
          <h4 className="text-xs font-medium text-gray-600">
            {tab === "daily" && "Past 7 Days"}
            {tab === "weekly" && "Past 13 Weeks"}
            {tab === "monthly" && "Past 12 Months"}
          </h4>
        </div>
        <div className="w-full h-32 relative overflow-visible">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 rounded z-10">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-xs text-gray-600">Loading...</span>
              </div>
            </div>
          )}
          <Bar data={chartData} options={chartOptions} key={`${tab}-${showAggregated}-${currentStats.length}`} />
        </div>
      </div>
    )
  }


  const fetchData = async (page = 1, filters = { type: selectedType, canSendStatus: selectedCanSendStatus, reason: selectedReason }) => {
    try {
      setIsLoading(true)
      const getAllData =  sendToBackground({
        name: "get-all-intercepted-data",
        body: {
          type: filters.type !== "all" ? filters.type : undefined,
          canSendStatus: filters.canSendStatus !== "all" 
            ? filters.canSendStatus === "yes" ? "true" : "false" 
            : undefined,
          reason: filters.reason !== "all" ? filters.reason : undefined,
          page,
          pageSize: pagination.pageSize
        }
      })

      const dataResponse = await getAllData

      DevLog("Data response:", dataResponse)


      
      DevLog("Response from background:", dataResponse)
      if (!dataResponse.success) {
        DevLog("Error fetching data from background:", dataResponse.error, "error")
        throw new Error(dataResponse.error || "Failed to fetch data")
      }

      // Update state with the new data structure
      setData(dataResponse.data)
      setPagination(dataResponse.pagination)
      setOverview(dataResponse.overview)
      setError(null)



    } catch (error) {
      DevLog("Error fetching data from background:", error, "error")
      setError("Failed to load data. Please try again later.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()

    // Set up periodic refresh every 30 seconds
    //const intervalId = setInterval(() => fetchData(pagination.page), 30000)

    //return () => clearInterval(intervalId)
  }, [])

  // Handle filter changes
  useEffect(() => {
    // Reset to page 1 when filters change
    fetchData(1, { type: selectedType, canSendStatus: selectedCanSendStatus, reason: selectedReason })
  }, [selectedType, selectedCanSendStatus, selectedReason])

  const getTypeColor = (type: string): string => {
    const colors: { [key: string]: string } = {
      "api_tweet-detail": "bg-blue-100",
      "api_home-timeline": "bg-green-100",
      "api_user-tweets": "bg-yellow-100",
      "api_search-timeline": "bg-purple-100",
      "api_following": "bg-pink-100",
      "api_followers": "bg-orange-100"
    }
    return colors[type] || "bg-gray-100"
  }

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return "Not sent"
    return new Date(timestamp).toLocaleString()
  }

  const getUniqueReasons = () => {
    return Object.keys(overview.reasonCounts || {})
  }

  // Function to handle reprocessing all items with a specific reason
  const handleReprocessByReason = async (reason: string) => {
    try {
      // Add reason to processing set to show loading state
      setProcessingReasons(prev => new Set(prev).add(reason))
      setProgressInfo({ operation: 'reprocess', current: 0, total: 0, percent: 0 })
      const user = await getUser();
      
      // Get all items with this reason using batched approach
      const filters = {
        reason,
        // Keep other current filters to be consistent
        type: selectedType !== "all" ? selectedType : undefined,
        canSendStatus: selectedCanSendStatus !== "all" 
          ? selectedCanSendStatus === "yes" ? "true" : "false" 
          : undefined
      }
      
      DevLog(`Fetching items to reprocess with reason "${reason}"`)
      
      // Use a smaller batch size for reprocessing to show progress more frequently
      const itemsToReprocess = await fetchAllDataInBatches(200, filters)
      
      DevLog(`Found ${itemsToReprocess.length} items to reprocess with reason "${reason}"`)
      setProgressInfo({ operation: 'reprocess', current: 0, total: itemsToReprocess.length, percent: 0 })
      
      // Process each item with progress tracking
      let processedCount = 0
      // Process items in batches of 10 in parallel
      const batchSize = 100;
      for (let i = 0; i < itemsToReprocess.length; i += batchSize) {
        const batch = itemsToReprocess.slice(i, i + batchSize);
        
        // Process batch in parallel
        const results = await Promise.all(
          batch.map(item => 
            sendToBackground({
              name: "send-intercepted-data",
              body: {
                originator_id: item.originator_id,
                type: item.type,
                data: item.data,
                date_added: item.date_added
              }
            })
          )
        );
        
        // Process results
        results.forEach((response, index) => {
          const item = batch[index];
          
          if (!response.success && isReprocessableReason(response.error)) {
            posthog.capture("reprocess_error", {
              user_id: user?.id??"anon",
              error: response.error,
              data: item,
              timestamp: new Date().toISOString()
            });
          }
          
          DevLog("Reprocessed item:", item, "Success:", response.success);
        });
        
        // Update processed count and progress
        processedCount += batch.length;
        const progress = Math.round((processedCount / itemsToReprocess.length) * 100);
        DevLog(`Reprocessing progress: ${progress}% (${processedCount}/${itemsToReprocess.length})`);
        setProgressInfo({ 
          operation: 'reprocess', 
          current: processedCount, 
          total: itemsToReprocess.length, 
          percent: progress 
        });
      }
      
      // Refresh data after successful reprocessing
      fetchData(pagination.page)
      
    } catch (error) {
      DevLog("Error reprocessing items:", error, "error")
      setError(`Failed to reprocess items: ${error.message}`)
    } finally {
      // Remove reason from processing set
      setProcessingReasons(prev => {
        const updated = new Set(prev)
        updated.delete(reason)
        return updated
      })
      setProgressInfo(null)
    }
  }

  // Check if a reason is reprocessable
  const isReprocessableReason = (reason: string): boolean => {
    return REPROCESSABLE_ERRORS.includes(reason)
  }

  const renderDataCard = (item: TimedObjectWithCanSendToCA) => {
    const isProcessing = item.reason && processingReasons.has(item.reason)
    console.log("item", item)
    const mappedData = item.type.includes("notification") ? item.data : TwitterDataMapper.mapAll(item.data)
    const tweet = item.type.includes("notification") ? item.data : mappedData[0].tweet;
    const account = item.type.includes("notification") ? item.originator_id : mappedData[0].account;

    const tweetText = item.type.includes("notification") ? item.data : mappedData[0].tweet.full_text;
    
    return (
      <div
        key={`${item.originator_id}`}
        className={`${getTypeColor(
          item.type
        )} rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow`}>
        <div className="flex justify-between items-start mb-2">
          <span className="text-sm font-medium text-gray-600">{item.type}</span>
          <span className="text-xs text-gray-500">
            Sent to CA at: {formatTimestamp(item.timestamp)}
          <br />
            Added to localdb at: {new Date(item.date_added).toLocaleString()}
          </span>
        </div>
        <div className="space-y-1">
          <p className="text-sm">
            <span className="font-medium">Tweet ID:</span> <a href={`https://twitter.com/${account?.username || "u"}/status/${item.originator_id}`} target="_blank" rel="noopener noreferrer">{item.originator_id}</a>
          </p>
          {tweet && (
            <p className="text-sm">
              <span className="font-medium">Tweet:</span> {tweetText.length > 80 ? `${tweetText.substring(0, 80)}...` : tweetText}
            </p>
          )}
          <p className="text-sm">
            <span className="font-medium">User:</span>{" "}
            {account?.username|| "Not available"}
          </p>
          {item.canSendToCA !== undefined && (
            <p className="text-sm">
              <span className="font-medium">Can Send to CA:</span>{" "}
              {item.canSendToCA ? "Yes" : "No"}
            </p>
          )}
          {item.reason && (
            <p className="text-sm text-red-600">
              <span className="font-medium">Reason:</span> {item.reason}
            </p>
          )}
        </div>
      </div>
    )
  }

  // Function to handle downloading all data
  const handleDownloadAllData = async () => {
    try {
      setIsDownloading(true)
      setDownloadType('all')
      setProgressInfo({ operation: 'download', current: 0, total: 0, percent: 0 })
      
      // Fetch data in batches
      const allData = await fetchAllDataInBatches()
      
      DevLog(`Preparing to download all data (${allData.length} items)`)
      setProgressInfo({ operation: 'download', current: allData.length, total: allData.length, percent: 100 })
      
      // Download all data as a single JSON file
      downloadDataAsJson(allData)
      
      setError(null)
    } catch (error) {
      DevLog("Error downloading data:", error, "error")
      setError(`Failed to download data: ${error.message}`)
    } finally {
      // Add a small delay before resetting the state to ensure the user sees the loading state
      setTimeout(() => {
        setIsDownloading(false)
        setDownloadType(null)
        setProgressInfo(null)
      }, 1000)
    }
  }
    
  // Function to handle downloading data as a zip file
  const handleDownloadAsZip = async () => {
    try {
      setIsDownloading(true)
      setDownloadType('zip')
      setProgressInfo({ operation: 'download', current: 0, total: 0, percent: 0 })
      
      // Fetch data in batches
      const allData = await fetchAllDataInBatches()
      
      DevLog(`Preparing to download data as zip (${allData.length} items)`)
      setProgressInfo({ operation: 'download', current: allData.length, total: allData.length, percent: 100 })
      
      // Download data as a zip file with each originator as a separate JSON file
      await downloadAsZip(allData)
      
      setError(null)
    } catch (error) {
      DevLog("Error downloading data as zip:", error, "error")
      setError(`Failed to download data as zip: ${error.message}`)
    } finally {
      // Add a small delay before resetting the state to ensure the user sees the loading state
      setTimeout(() => {
        setIsDownloading(false)
        setDownloadType(null)
        setProgressInfo(null)
      }, 1000)
    }
  }

  // Helper function to fetch all data in batches
  const fetchAllDataInBatches = async (batchSize = 500, customFilters?: Record<string, any>): Promise<TimedObjectWithCanSendToCA[]> => {
    const allData: TimedObjectWithCanSendToCA[] = []
    let currentPage = 1
    let hasMoreData = true
    
    // Apply filters - either custom filters or current UI filters
    const filters = customFilters || {
      type: selectedType !== "all" ? selectedType : undefined,
      canSendStatus: selectedCanSendStatus !== "all" 
        ? selectedCanSendStatus === "yes" ? "true" : "false" 
        : undefined,
      reason: selectedReason !== "all" ? selectedReason : undefined
    }
    
    DevLog("Starting batched data retrieval with filters:", filters)
    
    while (hasMoreData) {
      DevLog(`Fetching batch ${currentPage}...`)
      
      const response: BackgroundResponse = await sendToBackground({
        name: "get-all-intercepted-data",
        body: {
          ...filters,
          page: currentPage,
          pageSize: batchSize
        }
      })
      
      if (!response.success) {
        throw new Error(response.error || "Failed to fetch data batch")
      }
      
      const batchData = response.data
      allData.push(...batchData)
      
      DevLog(`Retrieved ${batchData.length} items in batch ${currentPage}`)
      
      // Check if we've reached the end
      if (batchData.length < batchSize || currentPage >= response.pagination.totalPages) {
        hasMoreData = false
        DevLog("All data retrieved, total items:", allData.length)
      } else {
        currentPage++
      }
      
      // Update progress in the UI
      if (response.pagination.totalCount > 0) {
        const progress = Math.round((allData.length / response.pagination.totalCount) * 100)
        DevLog(`Download progress: ${progress}% (${allData.length}/${response.pagination.totalCount})`)
        setProgressInfo({ 
          operation: 'download', 
          current: allData.length, 
          total: response.pagination.totalCount, 
          percent: progress 
        })
      }
    }
    
    return allData
  }

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchData(newPage)
    }
  }

  if (isLoading && !data.length) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  const types = ["all", ...Object.keys(overview.typeCounts || {})]
  const uniqueReasons = getUniqueReasons()

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Intercepted Data Dashboard</h1>
      <StatsComponent />

      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Progress Indicator */}
      {progressInfo && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-blue-700">
                {progressInfo.operation === 'download' ? 'Downloading data' : 'Reprocessing items'}
              </span>
              <span className="text-sm text-blue-600">
                {progressInfo.current} / {progressInfo.total} ({progressInfo.percent}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-blue-600 h-2.5 rounded-full" 
                style={{ width: `${progressInfo.percent}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Download Buttons */}
      <div className="mb-6 flex flex-wrap gap-4">
        <button
          onClick={handleDownloadAllData}
          disabled={isDownloading || overview.totalRecords === 0}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
            ${isDownloading || overview.totalRecords === 0
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed' 
              : 'bg-green-600 hover:bg-green-700'}`}>
          <FontAwesomeIcon 
            icon={faDownload} 
            className={`h-4 w-4 ${downloadType === 'all' && !progressInfo ? 'animate-spin' : ''}`} 
          />
          {downloadType === 'all' ? (
            progressInfo ? `Downloading... ${progressInfo.percent}%` : 'Downloading...'
          ) : 'Download All Data (Single File)'}
        </button>
        
        
        <button
          onClick={handleDownloadAsZip}
          disabled={isDownloading || overview.totalRecords === 0}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
            ${isDownloading || overview.totalRecords === 0
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed' 
              : 'bg-purple-600 hover:bg-purple-700'}`}>
          <FontAwesomeIcon 
            icon={faFileZipper} 
            className={`h-4 w-4 ${downloadType === 'zip' && !progressInfo ? 'animate-spin' : ''}`} 
          />
          {downloadType === 'zip' ? (
            progressInfo ? `Creating Zip... ${progressInfo.percent}%` : 'Creating Zip...'
          ) : 'Download Latest As Zip (By Tweet ID)'}
        </button>
      </div>

      {/* Stats */}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(overview.typeCounts || {}).map(([type, count]) => (
          <div
            key={type}
            className={`${getTypeColor(type)} rounded-lg p-4 text-center shadow-sm`}>
            <p className="text-sm font-medium text-gray-600">{type}</p>
            <p className="text-2xl font-bold text-gray-800">{count}</p>
            <p className="text-xs text-gray-500">items</p>
          </div>
        ))}
      </div>

      {/* Reprocess Buttons for Each Reprocessable Error */}
      <div className="mt-6 mb-6 flex flex-wrap gap-4">
        {uniqueReasons
          .filter(isReprocessableReason)
          .map(reason => {
            const isProcessing = processingReasons.has(reason)
            const itemCount = overview.reasonCounts[reason] || 0
            const isCurrentlyProcessing = isProcessing && progressInfo?.operation === 'reprocess'
              
            return (
              <button
                key={reason}
                onClick={() => handleReprocessByReason(reason)}
                disabled={isProcessing}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
                  ${isProcessing 
                    ? 'bg-gray-300 text-gray-600 cursor-not-allowed' 
                    : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
                <FontAwesomeIcon 
                  icon={faRotate} 
                  className={`h-4 w-4 ${isProcessing && !progressInfo ? 'animate-spin' : ''}`} 
                />
                {isCurrentlyProcessing 
                  ? `Processing... ${progressInfo.percent}%` 
                  : isProcessing 
                    ? 'Processing...' 
                    : `Reprocess ${itemCount} items with "${reason}"`}
              </button>
            )
          })}
      </div>

      {/* Filters */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <FontAwesomeIcon 
            icon={faFilter} 
            className="h-4 w-4 text-gray-500" 
          />
          <h2 className="text-sm font-semibold text-gray-700">Filters</h2>
        </div>
        
        <div className="flex flex-wrap gap-4">
          {/* Type Filter */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Type
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50">
              {types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Can Send to CA Filter */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Can Send to CA
            </label>
            <select
              value={selectedCanSendStatus}
              onChange={(e) => {
                setSelectedCanSendStatus(e.target.value)
                if (e.target.value !== "no") {
                  setSelectedReason("all")
                }
              }}
              className="block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50">
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          {/* Reason Filter - Only show when Can Send to CA is "no" */}
          {selectedCanSendStatus === "no" && (
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Reason
              </label>
              <select
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value)}
                className="block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50">
                <option value="all">All Reasons</option>
                {getUniqueReasons().map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Pagination Controls */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-sm text-gray-600">
            Showing page {pagination.page} of {pagination.totalPages} ({pagination.totalCount} total items)
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1 || isLoading}
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-sm
                ${pagination.page === 1 || isLoading
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>
              <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
              Previous
            </button>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages || isLoading}
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-sm
                ${pagination.page === pagination.totalPages || isLoading
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>
              Next
              <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Loading indicator for data refresh */}
      {/*isLoading && data.length > 0 && (
        <div className="flex justify-center items-center my-4">
          <div className="flex flex-col items-center">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-16 h-16 bg-blue-100 rounded-full animate-pulse"></div>
              <div className="absolute w-14 h-14 bg-blue-200 rounded-full animate-ping opacity-60"></div>
              <div className="relative z-10 w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
            </div>
            <div className="mt-3 text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full shadow-sm">
              Refreshing data...
            </div>
          </div>
        </div>
      )*/}

      {/* Data Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.length > 0 && data.map((item) => renderDataCard(item))}
      </div>

      {/* Empty state */}
      {data.length === 0 && !isLoading && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No data found matching the current filters.</p>
        </div>
      )}

      {/* Bottom Pagination Controls for convenience */}
      {pagination.totalPages > 1 && data.length > 0 && (
        <div className="flex justify-center mt-6">
          <div className="flex gap-2">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1 || isLoading}
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-sm
                ${pagination.page === 1 || isLoading
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>
              <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
              Previous
            </button>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages || isLoading}
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-sm
                ${pagination.page === pagination.totalPages || isLoading
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>
              Next
              <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default InterceptorDashboard
