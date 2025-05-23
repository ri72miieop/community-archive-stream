import { Storage } from "@plasmohq/storage"
import SwitchPreference from "~components/Preferences/PreferenceSwitch";
import { supabase } from "~core/supabase";
import type { Tweet } from "~InterceptorModules/types";
import { DevLog, isDev } from "~utils/devUtils";


export interface UserData {
    account_id: string,
    username: string,
    display_name: string,
    avatar_media_url: string,
    header_media_url: string,
    num_tweets: number,
    num_following: number,
    num_followers: number,
    num_likes: number
}

export interface TimedData<T>{
    data: T,
    last_updated: number
}


export interface User{
    user_id: string,
    username: string
}


export interface TweetEnhancementPreferences {
  interceptData: boolean,
  markTweetWithInterceptionStatus: boolean,
}
export interface PreferenceMetadata {
  preference: keyof TweetEnhancementPreferences;
  title: string;
  subtitle: string;
  disableRequiresRefresh: boolean;
  isEnabled: boolean;
}
export class TweetEnhancementPreferencesManager {
  private static readonly defaultPreferences: TweetEnhancementPreferences = {
    interceptData: true,
    markTweetWithInterceptionStatus: false
  };

  static getDefaultPreferences(): TweetEnhancementPreferences {
    return { ...this.defaultPreferences };
  }

  static getPreferenceMetadata(): PreferenceMetadata[] {
    return [
      {
        preference: "interceptData",
        title: "Intercept Data",
        subtitle: "Intercept data from X api responses and send them to Community Archive. This is useful to keep the archive as up to date as possible.",
        disableRequiresRefresh: false,
        isEnabled: true
      },
       {preference:"markTweetWithInterceptionStatus",
        title: "Mark status of tweet upload",
        subtitle: "Mark tweets with a badge indicating if they have been correctly uploaded to the community archive or not",
        disableRequiresRefresh: false,
        isEnabled: true
       }
    ];
  }
}




const defaultPreferences = TweetEnhancementPreferencesManager.getDefaultPreferences()

class CachedData {
  private static readonly PREFERENCES_KEY = "tweetEnhancementPreferences";

  async GetEnhancementPreferences(): Promise<TweetEnhancementPreferences> {
    try {

      const savedPrefs = await CachedData.syncStorage.get<TweetEnhancementPreferences>(CachedData.PREFERENCES_KEY);
      const prefs = Object.keys(defaultPreferences).reduce((acc, key) => ({
        ...acc,
        [key]: savedPrefs?.[key] ?? defaultPreferences[key]
      }), {} as TweetEnhancementPreferences);



      return prefs;
    } catch (error) {
      console.error('Error getting enhancement preferences:', error);
      return defaultPreferences;
    }
  }

  async SaveEnhancementPreferences(newPreferences: TweetEnhancementPreferences): Promise<void> {
    try {
      // Update storage
      await CachedData.syncStorage.set(CachedData.PREFERENCES_KEY, newPreferences);

      DevLog(`Saved enhancement preferences: ${JSON.stringify(newPreferences)}`);
    } catch (error) {
      console.error('Error saving enhancement preferences:', error);
      throw error;
    }
  }

  private static readonly CACHE_EXPIRATION = 1000 * 60 * 60 * 24; // 24 hours

  private static storage: Storage = new Storage({
    area: "local"
  })
  private static syncStorage: Storage = new Storage({
    area: "sync"
  })

  private static readonly USERDATA_KEY = "userData_"
 

  private static readonly CAN_INTERCEPT_KEY = "canIntercept"




  // Add a new property to track pending requests
  private static pendingRequests: { [key: string]: Promise<any> } = {};

  // Generic fetch and cache method
  private async fetchAndCache<T>(key: string, storage: Storage, fetchFunction: ( ) => Promise<T>, cache_expiration_in_ms:number = CachedData.CACHE_EXPIRATION): Promise<T> {
    
  const storedData = await CachedData.storage.get<TimedData<T>>(key);
  if (storedData && storedData.last_updated >= Date.now() - cache_expiration_in_ms) {
    DevLog(`Storage cache hit for key: ${key}`);
    return storedData.data;
  }

    // If there's already a pending request for this key, return its promise
    if (CachedData.pendingRequests[key]) {
      DevLog(`Request already pending for key: ${key}`);
      return CachedData.pendingRequests[key];
    }

    // Create new request promise
    DevLog(`Cache miss for key: ${key}, fetching from Supabase`);
    CachedData.pendingRequests[key] = (async () => {
      try {
        const data = await fetchFunction();
        const res: TimedData<T> = { data, last_updated: Date.now() };
        await storage.set(key, res);
        return data;
      } finally {
        // Clean up pending request after completion (success or failure)
        delete CachedData.pendingRequests[key];
      }
    })();

    return CachedData.pendingRequests[key];
  }

  async GetUserData(id:string) : Promise<UserData> {
    const userData = await CachedData.storage.get<TimedData<UserData>>(CachedData.USERDATA_KEY + id)

    if(!userData || userData.last_updated < Date.now() - 1000 * 60 * 60 * 24){
        const {data : acc_data, error} = await supabase.from("account").select("*").eq("account_id", id)
        if(error) throw error

        const {data :profile_data, error : profile_error} = await supabase.from("profile").select("*").eq("account_id", id)
        if(profile_error) throw profile_error

        const res: TimedData<UserData> ={
            data:{account_id: acc_data[0].account_id,
            username: acc_data[0].username,
            display_name: profile_data[0].display_name,
            avatar_media_url: profile_data[0].avatar_media_url,
            header_media_url: profile_data[0].header_media_url,
            num_tweets: acc_data[0].num_tweets,
            num_following: acc_data[0].num_following,
            num_followers: acc_data[0].num_followers,
            num_likes: acc_data[0].num_likes},
            last_updated: Date.now()
        }
        await CachedData.storage.set(CachedData.USERDATA_KEY + id, res)
        return res.data;
    }
    return userData.data;
  }

  async GetCanIntercept(userid: string): Promise<boolean> {
    const key = CachedData.CAN_INTERCEPT_KEY + userid;
    return this.fetchAndCache<boolean>(key, CachedData.storage, async () => {
      const {data, error} = await supabase.schema("tes").from("blocked_scraping_users").select("*").eq("account_id", userid)
      if(error) throw error
      return data.length==0
    }, 45 * 1000)
  }


  private async ResetCacheWithKey(key:string) {
    const allKeys = await CachedData.storage.getAll()
    const cacheSelectedKeys = Object.keys(allKeys).filter(allKey => allKey.startsWith(key))
    await Promise.all(cacheSelectedKeys.map(key => CachedData.storage.remove(key)))
  }
  async ResetAllCache(){
    await this.ResetCacheWithKey(CachedData.USERDATA_KEY)
  }
}



//export default CachedData


export const GlobalCachedData = new CachedData()