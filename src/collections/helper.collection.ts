import { MongoClientOptions } from "mongodb";
import { Settings } from "../models";
import * as Mongodb from 'mongodb'
import { LogUtil } from "../lib";

export class HelperCollection {
    client;
    db;
    collection;
    collectionName;
    options;

    constructor(collectionName: string, options?: MongoClientOptions) {
        this.collectionName = collectionName;
        this.options = { useNewUrlParser: true };
        this.connect();
    }

    public async getInstance() {
        if (!this.client || !this.db || !this.collection || await !this.isConnected()) {
            await this.connect();
        }

        return this.collection;
    }

    private async connect() {
        try {
            this.client = await Mongodb.connect(Settings.MONGO_URL, this.options);
            this.db = await this.client.db(Settings.MONGO_DB);
            this.collection = await this.db.collection(this.collectionName);
        } catch (err) {
            LogUtil.error({ e: 'HelperCollection.connect(): ' + err.message });
        }
    }

    private async isConnected() {
        if (!this.client || !this.db || !this.collection) {
            return false;
        }

        return await this.client.isConnected();
    }

}
