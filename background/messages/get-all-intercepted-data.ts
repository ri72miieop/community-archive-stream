import type { PlasmoMessaging } from "@plasmohq/messaging"

import { DevLog } from "~utils/devUtils"
import { indexDB } from "~utils/IndexDB"

const REPROCESSABLE_REASONS = [
  "Error processing tweet.",
  "Error uploading to Supabase"
]

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    DevLog("Interceptor.background.message - get-all-intercepted-data: Processing request with filters")
    
    
    const { type, canSendStatus, reason, page = 1, pageSize = 50 } = req.body || {}
    
    // Start with the base query - ensure it's reversed
    let query = indexDB.data.toCollection()
    
    // Build and apply filter conditions
    if (type && type !== "all") {
      query = query.filter(item => item.type === type)
    }
    
    if (canSendStatus && canSendStatus !== "all") {
      const canSend = canSendStatus === "true"
      query = query.filter(item => item.canSendToCA === canSend)
    }
    
    if (reason && reason !== "all") {
      query = query.filter(item => item.reason === reason)
    }
    
    // Get all filtered data for statistics (before pagination)
    const filteredData = (await query.sortBy("added_at")).toReversed()
    const totalCount = filteredData.length
    // Apply pagination
    const paginatedData = filteredData.slice((page - 1) * pageSize, page * pageSize);
    
    // Generate statistics in a single pass through the data
    const typeCounts = {}
    const reasonCounts = {}
    const reprocessableCountByReason = {}
    let canSendTrue = 0
    let canSendFalse = 0
    
    for (const item of filteredData) {
      // Type counts
      const type = item.type || "unknown"
      typeCounts[type] = (typeCounts[type] || 0) + 1
      
      // Reason counts
      if (item.reason) {
        reasonCounts[item.reason] = (reasonCounts[item.reason] || 0) + 1
        
        // Reprocessable counts
        if (REPROCESSABLE_REASONS.includes(item.reason)) {
          reprocessableCountByReason[item.reason] = (reprocessableCountByReason[item.reason] || 0) + 1
        }
      }
      
      // CanSendToCA counts
      if (item.canSendToCA === true) {
        canSendTrue++
      } else if (item.canSendToCA === false) {
        canSendFalse++
      }
    }
    
    const canSendCounts = { true: canSendTrue, false: canSendFalse }
    
    DevLog(`Interceptor.background.message - get-all-intercepted-data: Returning ${paginatedData.length} of ${totalCount} filtered records`)
    
    const responseData = { 
      success: true, 
      data: paginatedData,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      },
      overview: {
        typeCounts,
        reasonCounts,
        canSendCounts,
        reprocessableCountByReason,
        totalRecords: filteredData.length
      }
    };
    
    res.send(responseData)
  } catch (error) {
    DevLog("Error processing data from IndexDB:", error)
    res.send({ 
      success: false, 
      error: error.message 
    })
  }
}

export default handler