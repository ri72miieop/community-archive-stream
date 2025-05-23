/**
 * Utility functions for creating and downloading files
 * Uses browser-compatible APIs without external dependencies
 */

import type { TimedObjectWithCanSendToCA } from "./IndexDB";
import { DevLog } from "./devUtils";
import JSZip from "jszip";

// Declare JSZip as a global variable for TypeScript
declare global {
  interface Window {
    JSZip: any;
  }
}

/**
 * Creates a downloadable JSON file from a collection of data
 * 
 * @param data Array of data objects
 */
export const downloadDataAsJson = (data: TimedObjectWithCanSendToCA[]): void => {
  try {
    // Convert data to a JSON string with pretty formatting
    const jsonString = JSON.stringify(data, null, 2);
    
    // Create a blob from the JSON string
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // Create a URL for the blob
    const url = URL.createObjectURL(blob);
    
    // Create a download link and trigger the download
    const link = document.createElement('a');
    link.href = url;
    link.download = `intercepted-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(link);
    }, 100);
  } catch (error) {
    console.error('Error creating JSON file:', error);
    throw new Error(`Failed to create JSON file: ${error.message}`);
  }
};

/**
 * Groups data by originator_id and downloads each group as a separate JSON file
 * Only includes the most recent item for each originator_id
 * 
 * @param data Array of data objects with originator_id property
 */
export const downloadDataByOriginator = (data: TimedObjectWithCanSendToCA[]): void => {
  try {
    // Group data by originator_id and keep only the most recent item
    const latestByOriginator = getMostRecentItemsByOriginator(data);
    
    // Create a counter to track how many files we've downloaded
    let downloadCount = 0;
    const totalFiles = Object.keys(latestByOriginator).length;
    
    DevLog(`Starting download of ${totalFiles} files by originator_id`);
    
    // Create a zip-like folder structure using the browser's download API
    Object.entries(latestByOriginator).forEach(([originatorId, item], index) => {
      // Add a small delay between downloads to prevent browser throttling
      setTimeout(() => {
        try {
          const jsonString = JSON.stringify(item, null, 2);
          const blob = new Blob([jsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          
          const link = document.createElement('a');
          link.href = url;
          link.download = `${originatorId}.json`;
          document.body.appendChild(link);
          link.click();
          
          // Clean up
          setTimeout(() => {
            URL.revokeObjectURL(url);
            document.body.removeChild(link);
            downloadCount++;
            DevLog(`Downloaded file ${downloadCount} of ${totalFiles}`);
          }, 100);
        } catch (error) {
          console.error(`Error downloading file for originator ${originatorId}:`, error);
        }
      }, index * 300); // Stagger downloads by 300ms each
    });
  } catch (error) {
    console.error('Error downloading data by originator:', error);
    throw new Error(`Failed to download data: ${error.message}`);
  }
};

/**
 * Creates a zip file containing JSON files for each originator_id
 * Only includes the most recent item for each originator_id
 * Uses the installed JSZip package
 * 
 * @param data Array of data objects with originator_id property
 */
export const downloadAsZip = async (data: TimedObjectWithCanSendToCA[]): Promise<void> => {
  try {
    // Create a new zip instance using the installed JSZip package
    const zip = new JSZip();
    
    // Get the most recent item for each originator_id
    const latestByOriginator = getMostRecentItemsByOriginator(data);
    
    // Log how many files we're adding to the zip
    const totalFiles = Object.keys(latestByOriginator).length;
    DevLog(`Adding ${totalFiles} files to zip archive`);
    
    // Add each item as a separate JSON file to the zip
    Object.entries(latestByOriginator).forEach(([originatorId, item]) => {
      const jsonString = JSON.stringify(item, null, 2);
      zip.file(`${originatorId}.json`, jsonString);
    });
    
    // Generate the zip file
    DevLog("Generating zip file...");
    const zipBlob = await zip.generateAsync({ 
      type: 'blob',
      compression: "DEFLATE",
      compressionOptions: {
        level: 6
      }
    });
    DevLog(`Zip file generated with size: ${(zipBlob.size / 1024).toFixed(2)} KB`);
    
    // Create a download link and trigger the download
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `intercepted-data-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(link);
    }, 100);
    
    DevLog("Zip file created and download initiated");
  } catch (error) {
    console.error('Error creating zip file:', error);
    DevLog("Error creating zip file:", error, "error");
    throw new Error(`Failed to create zip file: ${error.message}`);
  }
};

/**
 * Helper function to get the most recent item for each originator_id
 * 
 * @param data Array of data objects with originator_id property
 * @returns Object with originator_id as key and the most recent item as value
 */
function getMostRecentItemsByOriginator(data: TimedObjectWithCanSendToCA[]): Record<string, TimedObjectWithCanSendToCA> {
  const latestByOriginator: Record<string, TimedObjectWithCanSendToCA> = {};
  
  data.forEach(item => {
    const originatorId = item.originator_id || 'unknown';
    const currentDate = new Date(item.date_added).getTime();
    
    // If we don't have this originator yet, or this item is more recent, update it
    if (!latestByOriginator[originatorId] || 
        currentDate > new Date(latestByOriginator[originatorId].date_added).getTime()) {
      latestByOriginator[originatorId] = item;
    }
  });
  
  DevLog(`Found ${Object.keys(latestByOriginator).length} unique originator_ids`);
  return latestByOriginator;
} 