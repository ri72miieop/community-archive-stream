//import posthog from 'posthog-js'


//import posthog from 'posthog-js/dist/module.full.no-external'  -- this is the full version with session replays etc, but it's getting the extension rejected on chrome web store for code obfuscation due to posthog external dependencies
//follow issue https://github.com/PostHog/posthog-js/issues/1464
import posthog from 'posthog-js/dist/module.no-external'

posthog.init(process.env.PLASMO_PUBLIC_POSTHOG_API_KEY,
    {
        api_host: 'https://us.i.posthog.com',
        person_profiles: 'always' // or 'always' to create profiles for anonymous users as well
    }
)

export default posthog
