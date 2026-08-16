
import Dexie, { type KeyPaths } from "dexie";
import { ExtensionType } from "~InterceptorModules/types/General";
import type { Tweet, Capture, User } from "~InterceptorModules/types";
import packageJson from '@/package.json';
import { DevLog } from "~utils/devUtils";
import { exportDB } from 'dexie-export-import';

export const CONTENT_DATABASE_NAME = packageJson.name;
export const CONTENT_DATABASE_VERSION = 2;

export class DatabaseManager {
  private db: Dexie;
  private openPromise: Promise<void> | null = null;

  constructor(databaseName = CONTENT_DATABASE_NAME) {
    this.db = new Dexie(databaseName);
    this.configureSchema();
  }

  /*
  |--------------------------------------------------------------------------
  | Type-Safe Table Accessors
  |--------------------------------------------------------------------------
  */

  private captures() {
    return this.db.table<Capture>('captures');
  }

  /*
  |--------------------------------------------------------------------------
  | Read Methods for Extensions
  |--------------------------------------------------------------------------
  */

  async extGetCaptures(extName: string) {
    return this.captures().where('extension').equals(extName).toArray().catch(this.logError);
  }

  async extGetCaptureCount(extName: string) {
    return this.captures().where('extension').equals(extName).count().catch(this.logError);
  }

  async extGetCapturedTweets(extName: string) {
    void extName;
    return [];
  }

  async extGetCapturedUsers(extName: string) {
    void extName;
    return [];
  }

  /*
  |--------------------------------------------------------------------------
  | Write Methods for Extensions
  |--------------------------------------------------------------------------
  */

  async extAddTweets(extName: string, tweets: Tweet[]) {
    await this.upsertCaptures(
      tweets.map((tweet) => ({
        id: `${extName}-${tweet.rest_id}`,
        extension: extName,
        type: ExtensionType.TWEET,
        data_key: tweet.rest_id,
        created_at: Date.now(),
      })),
    );
  }

  async extAddUsers(extName: string, users: User[]) {
    await this.upsertCaptures(
      users.map((user) => ({
        id: `${extName}-${user.rest_id}`,
        extension: extName,
        type: ExtensionType.USER,
        data_key: user.rest_id,
        created_at: Date.now(),
      })),
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Delete Methods for Extensions
  |--------------------------------------------------------------------------
  */

  async extClearCaptures(extName: string) {
    const captures = await this.extGetCaptures(extName);
    if (!captures) {
      return;
    }
    return this.captures().bulkDelete(captures.map((capture) => capture.id));
  }

  /*
  |--------------------------------------------------------------------------
  | Export and Import Methods
  |--------------------------------------------------------------------------
  */

  async export() {
    return exportDB(this.db).catch(this.logError);
  }

  async import(data: Blob) {
    void data;
    throw new Error('Legacy content-bearing database imports are disabled');
  }

  async clear() {
    await this.deleteAllCaptures();
    DevLog('Database cleared',"info");
  }

  async count() {
    try {
      return {
        tweets: 0,
        users: 0,
        captures: await this.captures().count(),
      };
    } catch (error) {
      this.logError(error);
      return null;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Common Methods
  |--------------------------------------------------------------------------
  */

  async upsertTweets(tweets: Tweet[]) {
    void tweets;
    throw new Error('Content-bearing tweet cache is disabled');
  }

  async upsertUsers(users: User[]) {
    void users;
    throw new Error('Content-bearing user cache is disabled');
  }

  async upsertCaptures(captures: Capture[]) {
    return this.db
      .transaction('rw', this.captures(), () => {
        return this.captures().bulkPut(captures).catch(this.logError);
      })
      .catch(this.logError);
  }

  async deleteAllTweets() {
    return;
  }

  async deleteAllUsers() {
    return;
  }

  async deleteAllCaptures() {
    return this.captures().clear().catch(this.logError);
  }

  /*
  |--------------------------------------------------------------------------
  | Migrations
  |--------------------------------------------------------------------------
  */

  private configureSchema() {
    // Indexes for the "captures" table.
    const captureIndexPaths: KeyPaths<Capture>[] = ['id', 'extension', 'type', 'created_at'];

    // Take care of database schemas and versioning.
    // See: https://dexie.org/docs/Tutorial/Design#database-versioning
    this.db
      .version(CONTENT_DATABASE_VERSION)
      .stores({
        tweets: null,
        users: null,
        captures: captureIndexPaths.join(','),
      })
      .upgrade(async () => {
        DevLog('Database upgraded', "info");
      });
  }

  async ready(): Promise<void> {
    if (!this.openPromise) {
      this.openPromise = this.db.open()
        .then(() => {
          DevLog('Database connected', "info");
        })
        .catch((error) => {
          this.openPromise = null;
          this.logError(error);
          throw error;
        });
    }

    await this.openPromise;
  }

  async init(): Promise<void> {
    await this.ready();
  }

  close(): void {
    this.db.close();
    this.openPromise = null;
  }

  /*
  |--------------------------------------------------------------------------
  | Loggers
  |--------------------------------------------------------------------------
  */

  logError(error: unknown) {
    DevLog(`Database Error: ${(error as Error).message}`, error, "error");
  }
}
