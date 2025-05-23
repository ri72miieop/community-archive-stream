import { useState } from 'react'
import { duplicateAllDataWithOlderTimestamp, deleteAllDuplicatedRecords } from '~utils/IndexDB'

export const IndexDbDuplicator = () => {
    const [isLoading, setIsLoading] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [result, setResult] = useState<{ success?: string; error?: string }>({})
    const [weeksOffset, setWeeksOffset] = useState(1)
  
    const handleDuplicate = async () => {
      setIsLoading(true)
      setResult({})
      try {
        await duplicateAllDataWithOlderTimestamp(weeksOffset)
        setResult({ success: `Successfully duplicated all data with ${weeksOffset} week(s) offset` })
      } catch (error) {
        setResult({ error: error.message || 'An error occurred while duplicating data' })
      } finally {
        setIsLoading(false)
      }
    }
  
    const handleDelete = async () => {
      if (!window.confirm('Are you sure you want to delete all duplicated records? This action cannot be undone.')) {
        return
      }
  
      setIsDeleting(true)
      setResult({})
      try {
        await deleteAllDuplicatedRecords()
        setResult({ success: 'Successfully deleted all duplicated records' })
      } catch (error) {
        setResult({ error: error.message || 'An error occurred while deleting duplicated records' })
      } finally {
        setIsDeleting(false)
      }
    }
  
    return (
      <div className="p-4 bg-white rounded-lg shadow-md max-w-md mx-auto my-4">
        <h2 className="text-lg font-semibold mb-4">Data Duplicator</h2>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <span>Weeks Offset:</span>
              <input
                type="number"
                min="1"
                value={weeksOffset}
                onChange={(e) => setWeeksOffset(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 px-2 py-1 border rounded"
              />
            </label>
            <button
              onClick={handleDuplicate}
              disabled={isLoading}
              className={`px-4 py-2 rounded-md text-white ${
                isLoading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              {isLoading ? 'Duplicating...' : 'Duplicate Data'}
            </button>
          </div>
          <div className="flex items-center justify-end">
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className={`px-4 py-2 rounded-md text-white ${
                isDeleting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              {isDeleting ? 'Deleting...' : 'Delete All Duplicates'}
            </button>
          </div>
        </div>
        {result.success && (
          <div className="p-3 bg-green-100 text-green-700 rounded mt-4">
            {result.success}
          </div>
        )}
        {result.error && (
          <div className="p-3 bg-red-100 text-red-700 rounded mt-4">
            {result.error}
          </div>
        )}
      </div>
    )
  }