import { Switch } from "~components/ui/switch";
import type { PreferenceMetadata, TweetEnhancementPreferences } from "~contents/Storage/CachedData";


interface SwitchPreferenceProps {
  prefMetadata: PreferenceMetadata;
  updatePreference: (key: keyof TweetEnhancementPreferences, value: boolean) => void;
}

const SwitchPreference: React.FC<SwitchPreferenceProps> = ({ prefMetadata, updatePreference }) => {
  return (
    <>
      <div id={prefMetadata.preference} className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">{prefMetadata.title}</h3>
          <p className="text-sm text-gray-500">{prefMetadata.subtitle}</p>
        </div>
        <Switch 
          className={`bg-blue-600`} 
          onCheckedChange={(checked) => updatePreference(prefMetadata.preference as keyof TweetEnhancementPreferences, checked)} 
        />
      </div>
    </>
  );
}

export default SwitchPreference