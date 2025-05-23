
import Dexie, { type KeyPaths } from "dexie";
import { ExtensionType } from "~InterceptorModules/types/General";
import type { Tweet, Capture, User } from "~InterceptorModules/types";
import { extractTweetMedia } from "~utils/twe_utils";
import packageJson from '@/package.json';
import { DevLog } from "~utils/devUtils";
import { exportDB, importInto } from 'dexie-export-import';
import { parseTwitterDateTime } from "~utils/common";

const DB_NAME = packageJson.name;
const DB_VERSION = 1;

export class DatabaseManager {
  private db: Dexie;

  constructor() {
    this.db = new Dexie(DB_NAME);
    this.init();
  }

  /*
  |--------------------------------------------------------------------------
  | Type-Safe Table Accessors
  |--------------------------------------------------------------------------
  */

  private tweets() {
    return this.db.table<Tweet>('tweets');
  }

  private users() {
    return this.db.table<User>('users');
  }

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
    const captures = await this.extGetCaptures(extName);
    if (!captures) {
      return [];
    }
    const tweetIds = captures.map((capture) => capture.data_key);
    return this.tweets()
      .where('rest_id')
      .anyOf(tweetIds)
      .filter((t) => this.filterEmptyData(t))
      .toArray()
      .catch(this.logError);
  }

  async extGetCapturedUsers(extName: string) {
    const captures = await this.extGetCaptures(extName);
    if (!captures) {
      return [];
    }
    const userIds = captures.map((capture) => capture.data_key);
    return this.users()
      .where('rest_id')
      .anyOf(userIds)
      .filter((t) => this.filterEmptyData(t))
      .toArray()
      .catch(this.logError);
  }

  /*
  |--------------------------------------------------------------------------
  | Write Methods for Extensions
  |--------------------------------------------------------------------------
  */

  async extAddTweets(extName: string, tweets: Tweet[]) {
    await this.upsertTweets(tweets);
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
    await this.upsertUsers(users);
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
    return importInto(this.db, data).catch(this.logError);
  }

  async clear() {
    await this.deleteAllCaptures();
    await this.deleteAllTweets();
    await this.deleteAllUsers();
    DevLog('Database cleared',"info");
  }

  async count() {
    try {
      return {
        tweets: await this.tweets().count(),
        users: await this.users().count(),
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
    return this.db
      .transaction('rw', this.tweets(), () => {
        const data: Tweet[] = tweets.map((tweet) => ({
          ...tweet,
          twe_private_fields: {
            created_at: +parseTwitterDateTime(tweet.legacy.created_at),
            updated_at: Date.now(),
            media_count: extractTweetMedia(tweet).length,
          },
        }));

        return this.tweets().bulkPut(data);
      })
      .catch(this.logError);
  }

  async upsertUsers(users: User[]) {
    return this.db
      .transaction('rw', this.users(), () => {
        const data: User[] = users.map((user) => ({
          ...user,
          twe_private_fields: {
            created_at: +parseTwitterDateTime(user.legacy.created_at),
            updated_at: Date.now(),
          },
        }));

        return this.users().bulkPut(data);
      })
      .catch(this.logError);
  }

  async upsertCaptures(captures: Capture[]) {
    return this.db
      .transaction('rw', this.captures(), () => {
        return this.captures().bulkPut(captures).catch(this.logError);
      })
      .catch(this.logError);
  }

  async deleteAllTweets() {
    return this.tweets().clear().catch(this.logError);
  }

  async deleteAllUsers() {
    return this.users().clear().catch(this.logError);
  }

  async deleteAllCaptures() {
    return this.captures().clear().catch(this.logError);
  }

  private filterEmptyData(data: Tweet | User) {
    if (!data?.legacy) {
      DevLog('Empty data found in DB', data, "warn");
      return false;
    }
    return true;
  }

  /*
  |--------------------------------------------------------------------------
  | Migrations
  |--------------------------------------------------------------------------
  */

  async init() {
    // Indexes for the "tweets" table.
    const tweetIndexPaths: KeyPaths<Tweet>[] = [
      'rest_id',
      'twe_private_fields.created_at',
      'twe_private_fields.updated_at',
      'twe_private_fields.media_count',
      'core.user_results.result.legacy.screen_name',
      'legacy.favorite_count',
      'legacy.retweet_count',
      'legacy.bookmark_count',
      'legacy.quote_count',
      'legacy.reply_count',
      'views.count',
      'legacy.favorited',
      'legacy.retweeted',
      'legacy.bookmarked',
    ];

    // Indexes for the "users" table.
    const userIndexPaths: KeyPaths<User>[] = [
      'rest_id',
      'twe_private_fields.created_at',
      'twe_private_fields.updated_at',
      'legacy.screen_name',
      'legacy.followers_count',
      'legacy.statuses_count',
      'legacy.favourites_count',
      'legacy.listed_count',
      'legacy.verified_type',
      'is_blue_verified',
      'legacy.following',
      'legacy.followed_by',
    ];

    // Indexes for the "captures" table.
    const captureIndexPaths: KeyPaths<Capture>[] = ['id', 'extension', 'type', 'created_at'];

    // Take care of database schemas and versioning.
    // See: https://dexie.org/docs/Tutorial/Design#database-versioning
    try {
      this.db
        .version(DB_VERSION)
        .stores({
          tweets: tweetIndexPaths.join(','),
          users: userIndexPaths.join(','),
          captures: captureIndexPaths.join(','),
        })
        .upgrade(async () => {
          DevLog('Database upgraded', "info");
        });

      await this.db.open();
      DevLog('Database connected', "info");
    } catch (error) {
      this.logError(error);
    }
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