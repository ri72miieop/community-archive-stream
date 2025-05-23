import { useEffect, useState } from "react"
import { supabase } from "~/core/supabase"
import { GlobalCachedData, type UserData } from "~contents/Storage/CachedData"

interface UserBadgeProps {
  userId: string
}

function UserInfo({ userId }: UserBadgeProps) {
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUserData() {
      const userData = await GlobalCachedData.GetUserData(userId)



      setUserData(userData)
      setLoading(false)
    }

    fetchUserData()
  }, [userId])

  if (loading) {
    return <span className="text-gray-400">Loading...</span>
  }

  if (!userData) {
    return <span className="text-gray-400">Unknown User</span>
  }

  return (
    <div>
      {userData.avatar_media_url && (
        <div><img
          src={userData.avatar_media_url}
          alt={userData.username || "User avatar"}
          className="max-w-10 max-h-10 rounded-full border border-gray-200 shadow-sm hover:scale-110 transition-transform"
        />
        </div>
      )}
      <div className="font-medium text-gray-800">
        {userData.username || userData.display_name || `User ${userData.account_id}`}
      </div>
    </div>
    
  )
}

export default UserInfo