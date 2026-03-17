/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from "pg";
import { IPreparedQuery } from "../queries/BaseQuery";
import { ModelColumnProperyMapping } from "../helpers/ModelColumnPropertyMapping";

export class DBConnector {

    private pool: Pool;

    constructor(config: PostgreSQLConfig) {
        this.pool = new Pool({
            user: config.user,
            host: config.host,
            database: config.database,
            password: config.password,
            port: config.port,
        });
    }

    /**
     * Run prepared query in PostgreSQL
     * @param preparedQuery Prepared Query
     * @param modelClass Model class, if want to convert result to model
     * @returns Result
     */
    public async runPreparedQuery<T = unknown>(preparedQuery: IPreparedQuery, modelClass?: { new(): T }): Promise<T[]> {
        const result = await this.pool.query(preparedQuery.query, preparedQuery.params);
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
}