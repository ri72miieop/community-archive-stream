import { useCallback, useEffect, useState } from 'react'
import { Switch } from '~components/ui/switch'
import { GlobalCachedData, TweetEnhancementPreferencesManager, type PreferenceMetadata, type TweetEnhancementPreferences } from '~contents/Storage/CachedData'
import { getUser } from '~utils/dbUtils'

import { Toaster } from "@/components/ui/shadcn/sonner"
import { toast } from "sonner"
import { RefreshCw, Loader2, AlertCircle } from 'lucide-react';


import "~prod.css"

function TweetEnhancementConfigTab() {
  const [preferences, setPreferences] = useState<TweetEnhancementPreferences>()
  const [user, setUser] = useState<{id: any, username: any} | null>(null)
  const [preferencesMetadata] = useState(()=>TweetEnhancementPreferencesManager.getPreferenceMetadata());
  useEffect(() => {

    const loadInitialData= async ()=>{
      const [fetchedUser, savedPrefs] = await Promise.all([
        getUser(),
        GlobalCachedData.GetEnhancementPreferences(),
      ]);

      if(fetchedUser){
        setUser(fetchedUser);
      }
      if (savedPrefs) {
        setPreferences(savedPrefs);
      }
    }
    loadInitialData();

    
  }, [])

  const updatePreference = useCallback(async (preferenceMetadata: PreferenceMetadata, value: boolean) => {
    if (!preferences) return;
    const originalPreferences = { ...preferences };
    const key: keyof TweetEnhancementPreferences = preferenceMetadata.preference as keyof TweetEnhancementPreferences
    const newPreferences = {
      ...preferences,
      [key]: value
    }
    setPreferences(newPreferences)
    if(preferenceMetadata.disableRequiresRefresh && value === false){
      toast.info("Refresh the page to fully apply this change.", {
        id: "refresh-required-toast",
        dismissible:false,
        duration: 12000
      });
    }
    try {
      await GlobalCachedData.SaveEnhancementPreferences(newPreferences);
      // Optional: Show success toast on save if desired
      // toast.success("Setting saved!");
    } catch (err) {
      console.error("Error saving preference:", err);
      toast.error(`Failed to save setting for "${preferenceMetadata.title}". Please try again.`);
      // --- Rollback UI on save failure ---
      setPreferences(originalPreferences);
    }
  }, [preferences]);

  

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-2xl font-bold mb-4">Settings</h2>

      <div className="space-y-4">

    <Toaster richColors />
    {preferencesMetadata && preferencesMetadata.filter(prefMetadata => prefMetadata.isEnabled).map((prefMetadata) => (
       <div id={prefMetadata.preference} className="flex items-center justify-between">
       <div>
         <h3 className="text-lg font-medium flex items-center gap-2">
           {prefMetadata.title}
           {prefMetadata.disableRequiresRefresh && (
             <span className="text-amber-500 cursor-help" title="Requires page refresh when disabled">
               <RefreshCw size={16} /> 
             </span>
           )}
         </h3>
         <p className="text-sm text-gray-500">{prefMetadata.subtitle}</p>
       </div>
       <Switch className={`bg-blue-600`} checked={preferences?.[prefMetadata.preference as keyof TweetEnhancementPreferences] ?? false} onCheckedChange={(checked) => updatePreference(prefMetadata, checked)} 
        
        aria-labelledby={`${prefMetadata.preference}-label`}/>
        <span id={`${prefMetadata.preference}-label`} className="sr-only">{prefMetadata.title}</span>
     </div>

    ))}
      
      </div>
    </div>
  )
}

export default TweetEnhancementConfigTab
