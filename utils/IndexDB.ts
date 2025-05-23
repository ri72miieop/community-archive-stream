import type { Tweet, User } from '../InterceptorModules/types';
import type * as Database from '~types/database-explicit-types';
import Dexie, { type EntityTable, type Transaction } from 'dexie';
import type { UserID, UserMinimal } from './dbUtils';

export type TimedObject = {
  timestamp: string;
  type: string;
  item_id: string;
  originator_id: string;
  data: any
  user_id: string;
};

export type TimedObjectWithCanSendToCA = TimedObject & {
  canSendToCA?: boolean;
  reason?: string;
  date_added: string;
}

export type TimedUserMention = UserID & {
  timestamp: string;
}

export type UserRelation = {
  id?: number;
  owner_id: string;
  user_id: string;
  updated_at: number;
}

export type UserProfile = {
  user_id: string;
  username: string;
  display_name?: string;
  avatar_media_url?: string;
  header_media_url?: string;
  num_tweets?: number;
  num_following?: number;
  num_followers?: number;
  num_likes?: number;
  last_updated: number;
}

const indexDB = new Dexie('tes') as Dexie & {
  data: EntityTable<TimedObjectWithCanSendToCA, 'item_id'>;
  userMentions: EntityTable<TimedUserMention, 'id'>;
  profiles: EntityTable<UserProfile, 'user_id'>;
  moots: EntityTable<UserRelation, 'id'>;
  followers: EntityTable<UserRelation, 'id'>;
  follows: EntityTable<UserRelation, 'id'>;
};

// Schema declaration:
indexDB.version(1).stores({
  data: 'item_id, originator_id, timestamp, canSendToCA',
  userMentions: 'id,timestamp',
  profiles: 'user_id, username, updated_at',
  moots: '++id, owner_id, user_id,  updated_at',
  followers: '++id, owner_id, user_id,  updated_at',
  follows: '++id, owner_id, user_id,  updated_at'

})

indexDB.version(2).stores({
  data: 'item_id, originator_id, timestamp, canSendToCA, added_at',
  
}).upgrade(transaction => {
  
  return transaction.table('data').toCollection().modify(item => {
  
    if (!item.added_at) {
      item.added_at = item.timestamp || new Date('2025-01-01').toISOString();
    }
  });
});

// Helper function to duplicate data with older timestamps
export async function duplicateDataWithOlderTimestamp(itemId: string, weeksOffset = 1): Promise<void> {
  try {
    // Get the original item
    const originalItem = await indexDB.data.get(itemId);
    
    if (!originalItem) {
      throw new Error(`Item with ID ${itemId} not found`);
    }

    // Create a new object with modified timestamps
    const duplicatedItem: TimedObjectWithCanSendToCA = {
      ...originalItem,
      item_id: `${originalItem.item_id}_duplicate_${Date.now()}`, // Create a unique ID
      timestamp: originalItem.timestamp 
        ? new Date(new Date(originalItem.timestamp).getTime() - (weeksOffset * 7 * 24 * 60 * 60 * 1000)).toISOString()
        : new Date(Date.now() - (weeksOffset * 7 * 24 * 60 * 60 * 1000)).toISOString(),
      date_added: originalItem.date_added
        ? new Date(new Date(originalItem.date_added).getTime() - (weeksOffset * 7 * 24 * 60 * 60 * 1000)).toISOString()
        : new Date(Date.now() - (weeksOffset * 7 * 24 * 60 * 60 * 1000)).toISOString()
    };

    // Add the duplicated item to the database
    await indexDB.data.add(duplicatedItem);
  } catch (error) {
    console.error('Error duplicating data:', error);
    throw error;
  }
}

// Helper function to duplicate multiple items
export async function duplicateManyDataWithOlderTimestamp(itemIds: string[], weeksOffset = 1): Promise<void> {
  try {
    await indexDB.transaction('rw', indexDB.data, async () => {
      for (const itemId of itemIds) {
        await duplicateDataWithOlderTimestamp(itemId, weeksOffset);
      }
    });
  } catch (error) {
    console.error('Error duplicating multiple items:', error);
    throw error;
  }
}

// Helper function to duplicate all records in the data table
export async function duplicateAllDataWithOlderTimestamp(weeksOffset = 1): Promise<void> {
  try {
    await indexDB.transaction('rw', indexDB.data, async () => {
      // Get all records from the data table
      const allRecords = await indexDB.data.toArray();
      
      // Create duplicates with modified timestamps
      const duplicates: TimedObjectWithCanSendToCA[] = allRecords.map(record => ({
        ...record,
        item_id: `${record.item_id}_duplicate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Ensure unique ID
        timestamp: record.timestamp 
          ? new Date(new Date(record.timestamp).getTime() - (weeksOffset * 7 * 24 * 60 * 60 * 1000)).toISOString()
          : new Date(Date.now() - (weeksOffset * 7 * 24 * 60 * 60 * 1000)).toISOString(),
        date_added: record.date_added
          ? new Date(new Date(record.date_added).getTime() - (weeksOffset * 7 * 24 * 60 * 60 * 1000)).toISOString()
          : new Date(Date.now() - (weeksOffset * 7 * 24 * 60 * 60 * 1000)).toISOString()
      }));

      // Bulk add all duplicates
      await indexDB.data.bulkAdd(duplicates);
      
      console.log(`Successfully duplicated ${duplicates.length} records`);
    });
  } catch (error) {
    console.error('Error duplicating all data:', error);
    throw error;
  }
}


export async function deleteAllDuplicatedRecords(): Promise<void> {
  try {
    const BATCH_SIZE = 500; 
    let totalDeleted = 0;
    const totalCount = await indexDB.data.filter(record => record.item_id.includes('_duplicate_')).count();
    
    
    // Process in batches
    await indexDB.transaction('rw', indexDB.data, async () => {
      let hasMore = true;
      
      while (hasMore) {
        const recordsToDelete = await indexDB.data
          .filter(record => record.item_id.includes('_duplicate_'))
          .limit(BATCH_SIZE)
          .toArray();
        
        if (recordsToDelete.length === 0) {
          hasMore = false;
          break;
        }
        
        // Extract IDs for deletion
        const idsToDelete = recordsToDelete.map(record => record.item_id);
        
        // Delete the batch
        await indexDB.data.bulkDelete(idsToDelete);
        
        totalDeleted += idsToDelete.length;
        console.log(`Deleted batch of ${idsToDelete.length} records. Progress: ${totalDeleted}/${totalCount}`);
      }
      
      console.log(`Successfully deleted ${totalDeleted} duplicated records in batches`);
    });
  } catch (error) {
    console.error('Error deleting duplicated records:', error);
    throw error;
  }
}

export async function cleanupOldRecords(maxRecords = 10000): Promise<number> {
  try {
    const totalCount = await indexDB.data.count();
    if (totalCount <= maxRecords) {
      console.log(`Database cleanup not needed. Current records: ${totalCount}, Threshold: ${maxRecords}`);
      return 0;
    }
    
    // Calculate how many records to delete
    const recordsToDelete = totalCount - maxRecords;
    console.log(`Database cleanup started. Current records: ${totalCount}, Deleting: ${recordsToDelete}`);
    
    const BATCH_SIZE = 500; // Process records in batches
    let totalDeleted = 0;
    
    await indexDB.transaction('rw', indexDB.data, async () => {
      let remainingToDelete = recordsToDelete;
      
      while (remainingToDelete > 0) {

        const oldestBatch = await indexDB.data
          .orderBy('timestamp')
          .limit(Math.min(BATCH_SIZE, remainingToDelete))
          .toArray();
        
        if (oldestBatch.length === 0) {
          console.log('No more eligible old records found for cleanup');
          break;
        }
        
        // Delete each record individually to ensure we're deleting the exact records we identified
        for (const record of oldestBatch) {
          // Use a compound key to ensure we're deleting the exact record
          await indexDB.data
            .where({
              item_id: record.item_id,
              timestamp: record.timestamp
            })
            .delete();
        }
        
        totalDeleted += oldestBatch.length;
        remainingToDelete -= oldestBatch.length;
        
        console.log(`Deleted batch of ${oldestBatch.length} records. Progress: ${totalDeleted}/${recordsToDelete}`);
      }
    });
    
    console.log(`Successfully deleted ${totalDeleted} old records during cleanup`);
    return totalDeleted;
  } catch (error) {
    console.error('Error cleaning up old records:', error);
    return 0;
  }
}

export { indexDB };
