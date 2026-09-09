/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from "pg";
import { IPreparedQuery } from "../queries/BaseQuery";
import { ModelColumnProperyMapping } from "../helpers/ModelColumnPropertyMapping";
import { readFileSync } from "node:fs";

export class DBConnector {

    private static poolRegistry: Record<string, Pool> = {};
    private _config: PostgreSQLConfig;

    constructor(config: PostgreSQLConfig) {
        this._config = config;
    }

    private static getConnection(config: PostgreSQLConfig) {
        const key = `${config.host}-${config.port}-${config.database}-${config.user}`;
        if (!this.poolRegistry[key]) {
            this.poolRegistry[key] = new Pool({
                user: config.user,
                host: config.host,
                database: config.database,
                password: config.password,
                port: config.port,
                ssl: {
                    rejectUnauthorized: config.rejectUnauthorized,
                    ca: readFileSync(config.caFile).toString(),
                    cert: readFileSync(config.clientCertFile).toString(),
                    key: readFileSync(config.clientKeyFile).toString(),
                },
            });
        }
        return this.poolRegistry[key];
    }

    /**
     * Run prepared query in PostgreSQL
     * @param preparedQuery Prepared Query
     * @param modelClass Model class, if want to convert result to model
     * @returns Result
     */
    public async runPreparedQuery<T = unknown>(preparedQuery: IPreparedQuery, modelClass?: { new(): T }): Promise<T[]> {
        const pool = DBConnector.getConnection(this._config);
        const result = await pool.query(preparedQuery.query, preparedQuery.params);
        if (modelClass) {
            return this.mapToModel(result.rows, modelClass);
        } else {
            return result.rows as T[];
        }
    }

    /**
     * Create Database config
     * @param connectionString Database connection string
     * @returns Parsed PostgreSQL config
     */
    public static createDatabaseConfig(connectionString: string): PostgreSQLConfig {
        return JSON.parse(connectionString);
    }

    /**
     * Map result rows to model
     * @param rows Result rows
     * @param modelClass Model class
     * @returns Model data
     */
    private mapToModel<T>(rows: any[], modelClass: new () => T): T[] {
        const columnMappings = ModelColumnProperyMapping.getColumnMappings(modelClass);
        return rows.map((row) => {
            const instance = new modelClass();
            for (const [propertyKey, columnName] of Object.entries(columnMappings)) {
                if (row[columnName] !== undefined) {
                    (instance as any)[propertyKey] = row[columnName];
                } else if (row[propertyKey] !== undefined) {
                    (instance as any)[propertyKey] = row[propertyKey];
                } else if (row[(modelClass as any).TABLE_NAME + "." + columnName] !== undefined) {
                    (instance as any)[propertyKey] = row[(modelClass as any).TABLE_NAME + "." + columnName];
                } else if (row[(modelClass as any).SCHEMA_NAME + "." + (modelClass as any).TABLE_NAME + "." + columnName] !== undefined) {
                    (instance as any)[propertyKey] = row[(modelClass as any).SCHEMA_NAME + "." + (modelClass as any).TABLE_NAME + "." + columnName];
                }
            }
            return instance;
        });
    }

    public static disconnect() {
        const keys = Object.keys(this.poolRegistry);
        for (const key of keys) {
            if (this.poolRegistry[key]) {
                this.poolRegistry[key].end();
                delete this.poolRegistry[key];
            }
        }
    }
}

/**
 * PostgreSQL Configuration
 */
export type PostgreSQLConfig = {
    user: string;
    host: string;
    database: string;
    password: string;
    port: number;
    rejectUnauthorized: boolean;
    caFile: string;
    clientCertFile: string;
    clientKeyFile: string;
}