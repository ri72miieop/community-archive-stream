import type { Provider, User } from "@supabase/supabase-js"
import { useEffect, useState } from "react"

import { sendToBackground } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"

import { supabase } from "~core/supabase"
import { GlobalCachedData } from "~contents/Storage/CachedData"
import { DevLog } from "~utils/devUtils"

import "prod.css"
import posthog from "~core/posthog"
import { EXTENSION_ID } from "~utils/consts"
import { indexDB } from "~utils/IndexDB"

const LoadingSpinner = () => (
  <svg 
    className="animate-spin h-5 w-5 text-white" 
    xmlns="http://www.w3.org/2000/svg" 
    fill="none" 
    viewBox="0 0 24 24"
  >
    <circle 
      className="opacity-25" 
      cx="12" 
      cy="12" 
      r="10" 
      stroke="currentColor" 
      strokeWidth="4"
    />
    <path 
      className="opacity-75" 
      fill="currentColor" 
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const Button = ({ 
  children, 
  variant = 'primary', 
  loading = false, 
  disabled = false, 
  className = '', 
  ...props 
}) => {
  const baseStyles = "flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 active:bg-blue-800",
    secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300 active:bg-gray-400",
    outline: "border-2 border-gray-300 hover:bg-gray-100 active:bg-gray-200",
    twitter: "bg-[#1DA1F2] text-white hover:bg-[#1a8cd8] active:bg-[#177bbf]"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoadingSpinner />}
      <span className={loading ? "ml-2" : ""}>{children}</span>
    </button>
  );
};

const SignIn = () => {
  const isDev = process.env.NODE_ENV === "development";

  const [user, setUser] = useStorage({
    key: "user",
    instance: new Storage({ area: "local" })
  });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function init() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error(error);
        return;
      }
      if (!!data.session) {
        setUser(data.session.user);
        sendToBackground({
          name: "init-session",
          body: {
            refresh_token: data.session.refresh_token,
            access_token: data.session.access_token
          }
        });
      }
    }

    init();
  }, []);

  const handleEmailLogin = async (type: "LOGIN" | "SIGNUP") => {
    try {
      setLoading(true);
      setError("");

      const {
        error,
        data: { user }
      } = type === "LOGIN"
        ? await supabase.auth.signInWithPassword({
            email: username,
            password
          })
        : await supabase.auth.signUp({ email: username, password });

      if (error) {
        setError(error.message);
      } else if (!user && type === "SIGNUP") {
        setError("Signup successful! Please check your email for confirmation.");
      } else {
        DevLog("user " + user.id, "debug");
        setUser(user);
      }
    } catch (error) {
      DevLog("error " + error, "error");
      setError(error.error_description || error.message);
      
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async () => {
    try {
      setLoading(true);
      setError("");
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "twitter",
        options: {
          redirectTo: `chrome-extension://${EXTENSION_ID}/options.html`
        }
      });

      if (error) {
        setError(error.message);
      }
      //if (data) {
      //  DevLog("data " + JSON.stringify(data), "debug");
      //}
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCacheReset = async () => {
    try {
      setLoading(true);
      await GlobalCachedData.ResetAllCache();
      await indexDB.userMentions.clear();
      await indexDB.data.clear();
      alert("Cache reset successful!");
    } catch (error) {
      DevLog("Error resetting cache:" + error, "error");
      setError("Error resetting cache");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut();
      setUser(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    return (
      <div className="flex justify-center items-start min-h-fit bg-gray-50">
        <div className="w-[460px] mx-8 my-6 h-[500px]">
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-800">Hi</h2>
                <p className="text-sm text-gray-500 truncate">@{user.app_metadata.user_name}</p>
              </div>
              <div className="space-y-3 max-w-[380px] mx-auto">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleLogout}
                  loading={loading}
                >
                  Sign Out
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    if (window.confirm("Are you sure you want to reset the cache? This will clear all locally stored data.")) {
                      handleCacheReset();
                    }
                  }}
                  loading={loading}
                >
                  Reset Cache
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-start min-h-fit bg-gray-50">
      <div className="w-[460px] mx-8 my-6">
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Welcome</h2>
              <p className="text-sm text-gray-500">Sign in to your account to continue</p>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
                {error}
              </div>
            )}

            {isDev && (
              <div className="space-y-4">
                <div className="max-w-[380px] mx-auto">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter your email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>

                <div className="max-w-[380px] mx-auto">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div className="space-y-3 max-w-[380px] mx-auto">
                  <Button variant="outline"
                    className="w-full"
                    onClick={() => handleEmailLogin("LOGIN")}
                    loading={loading}
                  >
                    Sign In
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleEmailLogin("SIGNUP")}
                    loading={loading}
                  >
                    Sign Up
                  </Button>
                </div>

                <div className="relative max-w-[380px] mx-auto">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">
                      Or continue with
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="max-w-[380px] mx-auto">
              <Button
                variant="twitter"
                className="w-full"
                onClick={handleOAuthLogin}
                loading={loading}
              >
                <svg 
                  className="w-5 h-5 mr-2 fill-current" 
                  viewBox="0 0 24 24"
                >
                  <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
                </svg>
                Sign in with Twitter
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;