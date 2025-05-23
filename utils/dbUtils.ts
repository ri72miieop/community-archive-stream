import { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "~core/supabase";

export const fetchTopTweetsByUser = async (username: string): Promise<any> => {
    const { data, error } = await supabase
    .from('account_activity_summary' as any)
    .select('most_retweeted_tweets, most_favorited_tweets')
    .eq('username', username)
    .single()
  
    if (error) throw error
  
    return data;
  }


  export interface UserMinimal{
    id: string;
    username: string;
  }

  export interface UserID{
    id: string;
   
  }

export const getUser = async () => {
  const {data,error} = await supabase.auth.getSession();
  if(error || !data.session) return null;
  
  return {id:data.session.user.app_metadata.provider_id,username:data.session.user.app_metadata.user_name};
}
export const getSignedInUser = async () => {
  const {data,error} = await supabase.auth.getSession();
  if(error) throw error;
  
  return {id:data.session.user.app_metadata.provider_id,username:data.session.user.app_metadata.user_name};
}
