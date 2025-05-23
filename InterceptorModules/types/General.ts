export type Interceptor = (
    request: Pick<Request, 'method' | 'url' | 'body'>,
    response: XMLHttpRequest
  ) => void;


  export enum ExtensionType {
    TWEET = 'tweet',
    USER = 'user',
    CUSTOM = 'custom',
    NONE = 'none',
  }