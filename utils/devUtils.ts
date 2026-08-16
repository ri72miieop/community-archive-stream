export const DevLog = (...args: any[]) => {
  const type = typeof args[args.length-1] === 'string' && ["info", "warn", "error", "debug"].includes(args[args.length-1])
    ? args.pop() as "info" | "warn" | "error" | "debug"
    : "info";

  const message = args.map(arg =>
    typeof arg === 'string' ? arg : JSON.stringify(arg)
  ).join(' ');

  if (process.env.NODE_ENV === "development" || (typeof window !== 'undefined' && (window as any).ENABLE_DEV_LOGS)) {
    // Get stack trace
    const stack = new Error().stack;
    // Convert stack to array of lines, skip first line (Error message)
    const stackLines = stack?.split('\n').slice(1) || [];
    
    // Filter stack to only show project files
    // Adjust this regex based on your project structure
    const projectStackLines = stackLines
      //.filter(line => line.includes('/src/')) // Filter to only show lines from your src directory
      .map(line => line.trim())
      .join('\n');

    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    let logMessage = `[DEV-${type.toUpperCase()} - ${timestamp}] ${message}`;

    switch (type) {
      case "warn":
        console.warn(logMessage);
        break;
      case "error":
        logMessage += `\n\nStack trace:\n${projectStackLines}`;
        console.error(logMessage);
        break;
      case "debug":
        console.debug(logMessage);
        break;
      default:
        console.log(logMessage);
    }
  }
};

export const isDev = process.env.NODE_ENV === "development"

export const PLASMO_PUBLIC_CRX_ID = process.env.PLASMO_PUBLIC_CRX_ID

export const PLASMO_PUBLIC_RECORD_EXPIRY_SECONDS = Number.parseInt(process.env.PLASMO_PUBLIC_RECORD_EXPIRY_SECONDS || "600")
