# baby-elephant-orm

A small query builder and result mapper for PostgreSQL, written in TypeScript.

You describe a query as a plain object, turn it into a prepared query (SQL text plus parameters), and run it through a `DBConnector`. If you hand the connector a model class, the rows come back as instances of that class, with database column names mapped to property names.

```typescript
const query = new SelectQuery({
    tableSchema: { schemaName: Module.SCHEMA_NAME, tableName: Module.TABLE_NAME },
    conditions: [[{ columnName: Module.MODULE_ID, columnValue: 1, operator: QueryOperator.equal }]]
});

const modules = await db.runPreparedQuery(query.generateQuery(), Module); // Module[]
```

## Contents

- [Requirements and install](#requirements-and-install)
- [Connecting](#connecting)
- [Defining models](#defining-models)
- [Select](#select)
- [Insert](#insert)
- [Update](#update)
- [Delete](#delete)
- [Conditions and operators](#conditions-and-operators)
- [Aggregates](#aggregates)
- [Joins](#joins)
- [Ordering, paging and search](#ordering-paging-and-search)
- [Running queries and mapping results](#running-queries-and-mapping-results)
- [Safety notes](#safety-notes)
- [A complete repository](#a-complete-repository)
- [API reference](#api-reference)

## Requirements and install

```bash
npm install baby-elephant-orm
```

- Node.js (the connector reads certificate files with `node:fs`)
- A PostgreSQL server reachable over TLS with client certificates. The connector always builds its SSL settings from a CA file, a client certificate and a client key, so all three files must exist.

## Connecting

`DBConnector` takes a `PostgreSQLConfig`:

```typescript
import { DBConnector, PostgreSQLConfig } from "baby-elephant-orm";

const config: PostgreSQLConfig = {
    user: "app_user",
    host: "db.example.com",
    database: "core",
    password: "secret",
    port: 5432,
    rejectUnauthorized: true,
    caFile: "/certs/ca.crt",
    clientCertFile: "/certs/client.crt",
    clientKeyFile: "/certs/client.key"
};

const db = new DBConnector(config);
```

If you keep the config in an environment variable or a secrets store, `DBConnector.createDatabaseConfig` parses it for you. It expects the config **as a JSON string** with the same fields as above:

```typescript
const db = new DBConnector(DBConnector.createDatabaseConfig(process.env.CORE_DB_CONNECTION!));
```

### Connection pooling

Pools are created lazily on the first query and are shared across the whole process, keyed by `host`, `port`, `database` and `user`. This means it is fine for every repository to create its own `DBConnector`: they all end up using the same pool for the same database.

Call `DBConnector.disconnect()` to close every pool, for example on shutdown or at the end of a test run.

## Defining models

A model has two halves, and they do different jobs:

- **Static members** (`SCHEMA_NAME`, `TABLE_NAME`, and one constant per column) are what you use when *building* queries. Using `Module.MODULE_NAME` instead of the string `"c_modulename"` means a renamed column is a one-line change, and the compiler finds every use.
- **Decorated properties** (`@ColumnName("c_modulename") moduleName`) are what the mapper uses when *reading* rows. They map a database column to a property name so your code works with `moduleName` while the database keeps `c_modulename`.

### The column decorator

The mapper reads a `columnMappings` object (property name → column name) from the model's **prototype**. A decorator that fills it in looks like this (written for TypeScript's `experimentalDecorators`):

```typescript
// customs/Decorators.ts
export function ColumnName(columnName: string) {
    return function (target: any, propertyKey: string) {
        // Give every class its own object, so a subclass doesn't write into its parent's mappings.
        if (!Object.prototype.hasOwnProperty.call(target, "columnMappings")) {
            target.columnMappings = {};
        }
        target.columnMappings[propertyKey] = columnName;
    };
}
```

### A base model and a table model

Put columns that every table shares (such as audit columns) in a base class:

```typescript
// models/Model.ts
import { ColumnName } from "../customs/Decorators";

export class Model {
    public static SCHEMA_NAME: string = "";
    public static TABLE_NAME: string = "";

    public static CREATEDBY: string = "c_createdby";
    public static CREATEDDATE: string = "c_createddate";
    public static UPDATEDBY: string = "c_updatedby";
    public static UPDATEDDATE: string = "c_updateddate";

    @ColumnName("c_createdby")
    createdBy!: number;

    @ColumnName("c_createddate")
    createdDate!: string;

    @ColumnName("c_updatedby")
    updatedBy!: number;

    @ColumnName("c_updateddate")
    updatedDate!: string;
}
```

```typescript
// models/Module.ts
import { ColumnName } from "../customs/Decorators";
import { Model } from "./Model";

export class Module extends Model {
    public static SCHEMA_NAME = "core" as string;
    public static TABLE_NAME = "t_sys_modules" as string;
    public static MODULE_ID = "c_moduleid" as string;
    public static MODULE_NAME = "c_modulename" as string;
    public static MODULEGROUP_ID = "c_modulegroupid" as string;

    @ColumnName("c_moduleid")
    moduleId!: number;

    @ColumnName("c_modulename")
    moduleName!: string;

    @ColumnName("c_modulegroupid")
    moduleGroupId!: number;
}

// For results that are not full table rows, such as a few aliased columns.
export interface IModuleName {
    moduleId: number;
    moduleName: string;
}
```

### How rows are mapped

When you pass a model class to `runPreparedQuery`, each decorated property is filled from the row using the first of these keys that exists:

| Order | Row key tried | Typical source |
| --- | --- | --- |
| 1 | `columnName` | `SELECT *`, or a column aliased with its own name |
| 2 | `propertyName` | a column aliased with the property name (`alias: "moduleName"`) |
| 3 | `TABLE_NAME.columnName` | |
| 4 | `SCHEMA_NAME.TABLE_NAME.columnName` | a column selected **without** an alias (see [Select](#select)) |

Properties that match none of these are left unset. Only decorated properties are mapped. The model class needs a constructor that takes no arguments, and the mapper merges the mappings of the class and its **direct** parent, so a base class works but a deeper chain (grandparent and above) is not merged.

## Select

```typescript
import { SelectQuery, QueryOperator, IPreparedQuery } from "baby-elephant-orm";

async getById(moduleId: number): Promise<Module> {
    const selectQuery = new SelectQuery({
        columns: [
            { columnName: Module.MODULE_ID },
            { columnName: Module.MODULE_NAME },
            { columnName: Module.MODULEGROUP_ID }
        ],
        tableSchema: { schemaName: Module.SCHEMA_NAME, tableName: Module.TABLE_NAME },
        conditions: [[{
            columnName: Module.MODULE_ID,
            columnValue: moduleId,
            operator: QueryOperator.equal
        }]]
    });
    const preparedQuery: IPreparedQuery = selectQuery.generateQuery();
    const modules = await this.databaseConnection.runPreparedQuery(preparedQuery, Module);
    if (modules.length === 0) {
        throw new Error("Module not found.");
    }
    return modules[0];
}
```

- If you leave out `columns`, the query is `SELECT *`.
- A column without an `alias` is returned under the key `schema.table.column` (for example `core.t_sys_modules.c_moduleid`). That is exactly what the mapper's fourth lookup rule expects, which is why the example above maps onto `Module` without any aliases.
- Give a column an `alias` when you want a specific result key, which is what you do for joins and for results typed with an interface instead of a model.
- `SelectQuery` modifies the `columns` array you pass in (it fills in each column's `tableSchema` and quotes its alias). Build a fresh params object for every query rather than reusing one.

## Insert

`InsertQuery` takes the table, the columns to write and the values, matched by position. The inserted rows are returned to you (`RETURNING *`).

```typescript
import { InsertQuery } from "baby-elephant-orm";

async create(module: Module): Promise<Module> {
    const insertQuery = new InsertQuery({
        tableSchema: { schemaName: Module.SCHEMA_NAME, tableName: Module.TABLE_NAME },
        insertColumns: [Module.MODULE_NAME, Module.MODULEGROUP_ID, Module.CREATEDBY, Module.CREATEDDATE],
        values: [module.moduleName, module.moduleGroupId, module.createdBy, DateTime.CurrentISOTime()]
    });
    const inserted = await this.databaseConnection.runPreparedQuery(insertQuery.generateQuery(), Module);
    if (inserted.length === 0) {
        throw new Error("Failed to create a module.");
    }
    return inserted[0];
}
```

To insert several rows in one statement, pass an array of arrays as `values`:

```typescript
new InsertQuery({
    tableSchema: { schemaName: Module.SCHEMA_NAME, tableName: Module.TABLE_NAME },
    insertColumns: [Module.MODULE_NAME, Module.MODULEGROUP_ID],
    values: [
        ["Billing", 1],
        ["Reports", 1]
    ]
});
```

If the number of values in any row doesn't match `insertColumns`, the constructor throws `INSERT requires columns and matching values.`, so a mistake is caught before anything reaches the database.

## Update

`UpdateQuery` takes a list of `{ columnName, columnValue }` pairs and the conditions that choose which rows to change. The updated rows are returned (`RETURNING *`).

```typescript
import { UpdateQuery, QueryOperator } from "baby-elephant-orm";

async update(module: Module): Promise<Module> {
    const updateQuery = new UpdateQuery({
        tableSchema: { schemaName: Module.SCHEMA_NAME, tableName: Module.TABLE_NAME },
        updates: [
            { columnName: Module.MODULE_NAME, columnValue: module.moduleName },
            { columnName: Module.MODULEGROUP_ID, columnValue: module.moduleGroupId },
            { columnName: Module.UPDATEDBY, columnValue: module.updatedBy },
            { columnName: Module.UPDATEDDATE, columnValue: DateTime.CurrentISOTime() }
        ],
        conditions: [[{
            columnName: Module.MODULE_ID,
            columnValue: module.moduleId,
            operator: QueryOperator.equal
        }]]
    });
    const updated = await this.databaseConnection.runPreparedQuery(updateQuery.generateQuery(), Module);
    if (updated.length === 0) {
        throw new Error("Failed to update a module.");
    }
    return updated[0];
}
```

### Partial updates with `updateIfNull`

Set `updateIfNull: false` on an update when a `null` or `undefined` value should mean "leave this column alone" instead of "overwrite it with null". This is handy for PATCH-style endpoints where the caller sends only some fields:

```typescript
updates: [
    { columnName: Module.MODULE_NAME, columnValue: changes.moduleName, updateIfNull: false },
    { columnName: Module.MODULEGROUP_ID, columnValue: changes.moduleGroupId, updateIfNull: false },
    { columnName: Module.UPDATEDDATE, columnValue: DateTime.CurrentISOTime() }
]
```

Without the flag, a `null` value is written to the column as `NULL`.

## Delete

`DeleteQuery` takes a table and conditions, and returns the deleted rows (`RETURNING *`). That makes it easy to confirm that something was actually deleted, and to hand the removed row back to the caller:

```typescript
import { DeleteQuery, QueryOperator } from "baby-elephant-orm";

async delete(moduleId: number): Promise<Module> {
    const deleteQuery = new DeleteQuery({
        tableSchema: { schemaName: Module.SCHEMA_NAME, tableName: Module.TABLE_NAME },
        conditions: [[{
            columnName: Module.MODULE_ID,
            columnValue: moduleId,
            operator: QueryOperator.equal
        }]]
    });
    const deleted = await this.databaseConnection.runPreparedQuery(deleteQuery.generateQuery(), Module);
    if (deleted.length === 0) {
        throw new Error("Failed to delete a module.");
    }
    return deleted[0];
}
```

> **Careful:** `conditions` is optional in the types. A `DeleteQuery` (or `UpdateQuery`) with no conditions affects **every row** in the table.

## Conditions and operators

`conditions` is an array of groups. Conditions inside a group are joined with `AND`, and the groups are joined with `OR`:

```typescript
conditions: [
    [ a, b ],   // (a AND b)
    [ c ]       // OR (c)
]
// WHERE (a AND b) OR (c)
```

Every condition is `{ columnName, columnValue, operator }`. By default the column is looked up on the main table. To filter on a joined table, add a `tableSchema` to the condition. All values are sent as query parameters (`$1`, `$2`, ...), never concatenated into the SQL.

| Operator | SQL | Notes |
| --- | --- | --- |
| `QueryOperator.equal` | `=` | |
| `QueryOperator.notEqual` | `!=` | |
| `QueryOperator.greaterThan` | `>` | |
| `QueryOperator.lessThan` | `<` | |
| `QueryOperator.greaterThanOrEqual` | `>=` | |
| `QueryOperator.lessThanOrEqual` | `<=` | |
| `QueryOperator.like` | `LIKE` | You supply the `%` wildcards in the value. |
| `QueryOperator.iLike` | `ILIKE` | Case-insensitive `LIKE`. |
| `QueryOperator.in` | `= ANY (...)` | Pass an array as `columnValue`. |
| `QueryOperator.isNull` | `IS NULL` | No value is used. |
| `QueryOperator.isNotNull` | `IS NOT NULL` | No value is used. |

For `isNull` and `isNotNull` the type still requires a `columnValue`, but it is ignored.

A common pattern is to start with the fixed conditions and then push extra ones onto the first group, which narrows the result with `AND`. The "does this name already exist, ignoring this record" check is a good example:

```typescript
async isModuleNameExist(moduleName: string, moduleId?: number): Promise<boolean> {
    const selectQueryParams: SelectQueryParams = {
        columns: [{ columnName: Module.MODULE_ID }],
        tableSchema: { schemaName: Module.SCHEMA_NAME, tableName: Module.TABLE_NAME },
        conditions: [[{
            columnName: Module.MODULE_NAME,
            columnValue: moduleName,
            operator: QueryOperator.equal
        }]]
    };
    if (moduleId && selectQueryParams.conditions) {
        selectQueryParams.conditions[0].push({
            columnName: Module.MODULE_ID,
            columnValue: moduleId,
            operator: QueryOperator.notEqual
        });
    }
    const modules = await this.databaseConnection.runPreparedQuery(
        new SelectQuery(selectQueryParams).generateQuery(), Module
    );
    return modules.length > 0;
}
```

## Aggregates

Set `aggregateFunction` on a column, and **always give it an `alias`**:

```typescript
import { QueryAggregateFunction, ICount } from "baby-elephant-orm";

const countQuery = new SelectQuery({
    tableSchema: { schemaName: Module.SCHEMA_NAME, tableName: Module.TABLE_NAME },
    columns: [
        { columnName: Module.MODULE_ID, aggregateFunction: QueryAggregateFunction.count, alias: "count" }
    ]
});
const [result] = await db.runPreparedQuery<ICount>(countQuery.generateQuery());
```

| Value | SQL |
| --- | --- |
| `QueryAggregateFunction.count` | `COUNT(...)` |
| `QueryAggregateFunction.distinst` | `DISTINCT(...)` (the member name is spelled `distinst` in the current release) |
| `QueryAggregateFunction.max` | `MAX(...)` |
| `QueryAggregateFunction.min` | `MIN(...)` |

Pass an array to nest functions from the outside in. `[QueryAggregateFunction.count, QueryAggregateFunction.distinst]` produces `COUNT(DISTINCT(...))`.

> `COUNT` returns a PostgreSQL `bigint`, which `pg` hands back as a **string** by default even though `ICount.count` is typed as `number`. Convert with `Number(result.count)` if you need to do arithmetic or strict comparisons.

## Joins

A join names the table to join, the join type, and one or more conditions that relate a column on the primary table to a column on the joined table. Join types are `JoinType.inner`, `left`, `right` and `full`.

```typescript
import { JoinType, QueryOperator } from "baby-elephant-orm";

const selectQueryParams: SelectQueryParams = {
    tableSchema: { schemaName: Module.SCHEMA_NAME, tableName: Module.TABLE_NAME },
    columns: [
        { columnName: Module.MODULE_ID, alias: "moduleId" },
        { columnName: Module.MODULE_NAME, alias: "moduleName" },
        {
            columnName: ModuleGroup.MODULEGROUP_NAME, alias: "moduleGroupName",
            tableSchema: { schemaName: ModuleGroup.SCHEMA_NAME, tableName: ModuleGroup.TABLE_NAME }
        }
    ],
    joins: [{
        joinType: JoinType.left,
        tableSchema: { schemaName: ModuleGroup.SCHEMA_NAME, tableName: ModuleGroup.TABLE_NAME },
        joinCondition: [{
            primaryTableSchema: { schemaName: Module.SCHEMA_NAME, tableName: Module.TABLE_NAME },
            primaryColumnName: Module.MODULEGROUP_ID,
            operator: QueryOperator.equal,
            secondaryTableSchema: { schemaName: ModuleGroup.SCHEMA_NAME, tableName: ModuleGroup.TABLE_NAME },
            secondaryColumnName: ModuleGroup.MODULEGROUP_ID
        }]
    }]
};
```

Columns that belong to a joined table need their own `tableSchema` so the query knows which table to read them from.

### Joining the same table twice

Inside the generated SQL every table is referenced by an alias, which defaults to `schema.table`. Joining the same table twice would make those aliases collide, so give each join a `tableAliasName` and refer to that alias, with only `tableName` set, wherever you reference it. Here `User` is joined once for the creator and once for the last editor:

```typescript
columns: [
    { columnName: User.USER_NAME, tableSchema: { tableName: User.TABLE_NAME + 1 }, alias: "createdByUsername" },
    { columnName: User.USER_NAME, tableSchema: { tableName: User.TABLE_NAME + 2 }, alias: "updatedByUsername" }
],
joins: [
    {
        joinType: JoinType.left,
        tableSchema: { schemaName: User.SCHEMA_NAME, tableName: User.TABLE_NAME },
        tableAliasName: User.TABLE_NAME + 1,
        joinCondition: [{
            primaryTableSchema: { schemaName: Module.SCHEMA_NAME, tableName: Module.TABLE_NAME },
            primaryColumnName: Module.CREATEDBY,
            operator: QueryOperator.equal,
            secondaryTableSchema: { tableName: User.TABLE_NAME + 1 },
            secondaryColumnName: User.USER_ID
        }]
    },
    {
        joinType: JoinType.left,
        tableSchema: { schemaName: User.SCHEMA_NAME, tableName: User.TABLE_NAME },
        tableAliasName: User.TABLE_NAME + 2,
        joinCondition: [{
            primaryTableSchema: { schemaName: Module.SCHEMA_NAME, tableName: Module.TABLE_NAME },
            primaryColumnName: Module.UPDATEDBY,
            operator: QueryOperator.equal,
            secondaryTableSchema: { tableName: User.TABLE_NAME + 2 },
            secondaryColumnName: User.USER_ID
        }]
    }
]
```

## Ordering, paging and search

`limit`, `offset` and `orders` go directly on the select params. Because results are mapped to your own property names, `orders[].columnName` refers to a **result column alias** (`"createdDate"`), not the raw database column.

```typescript
import { OrderDirection, IOrders } from "baby-elephant-orm";

const selectQueryParams: SelectQueryParams = {
    // ...tableSchema, columns, joins
    limit: gridConfig.recordPerPage,
    offset: gridConfig.recordPerPage * gridConfig.currentPage,
    orders: gridConfig.orders?.length ? gridConfig.orders : [
        { columnName: "createdDate", direction: OrderDirection.descending } as IOrders
    ]
};
```

- `OrderDirection.ascending` is `ASC` and `OrderDirection.descending` is `DESC`.
- `IOrders` also declares a `modelKey` field. It is not used when the SQL is generated, so building an order inline needs the `as IOrders` cast shown above.
- A `limit` or `offset` of `0` is left out of the SQL.

Since the params are a plain object, add things like a search filter only when needed:

```typescript
if (searchText && searchText !== "") {
    selectQueryParams.conditions = [[{
        columnName: Module.MODULE_NAME,
        columnValue: "%" + searchText + "%",
        operator: QueryOperator.iLike
    }]];
}
```

If the query already has conditions, push onto `conditions[0]` instead, as in the [conditions section](#conditions-and-operators).

## Running queries and mapping results

Every query is run in the same two steps:

```typescript
const prepared: IPreparedQuery = query.generateQuery();                  // { query: string, params: unknown[] }
const withModel = await db.runPreparedQuery(prepared, Module);           // Module[]
const withType  = await db.runPreparedQuery<IModuleName>(prepared);      // IModuleName[], raw rows
```

- Pass a **model class** when the result is that model's own columns. Rows are turned into instances through the `@ColumnName` mappings ([how rows are mapped](#how-rows-are-mapped)).
- Pass a **type argument** with no class when the result is a custom shape, such as aliased columns from a join, or an aggregate like `ICount`. The rows are returned exactly as PostgreSQL gave them, so your aliases are the keys.

`generateQuery()` is plain data, so you can log it while debugging.

### Mapping helpers

The `ModelColumnProperyMapping` class (note the spelling of the export) exposes the same mappings the connector uses:

```typescript
import { ModelColumnProperyMapping } from "baby-elephant-orm";

const mappings = ModelColumnProperyMapping.getColumnMappings(Module);
// { moduleId: "c_moduleid", moduleName: "c_modulename", ... }

ModelColumnProperyMapping.getColumnNameByProperty("moduleName", mappings); // "c_modulename"
ModelColumnProperyMapping.getPropertyByColumnName("c_modulename", mappings); // "moduleName"
```

Both lookups throw `Error while getting column metadata.` when nothing matches, which makes them handy for validating a property name that came from a client.

## Safety notes

Understanding what is and isn't parameterised matters here:

- **Values are parameterised.** Everything in `columnValue`, `values` and `updates` is passed to PostgreSQL as a bound parameter.
- **Identifiers are not.** Schema, table and column names, aliases, `tableAliasName`, `orders[].columnName`, and `limit` and `offset` are written straight into the SQL text. Treat them as code, not data. Never pass user input into them unchecked. If a client chooses the sort column or page size, validate it first (for example against the model's mappings with `ModelColumnProperyMapping`, and `Number.isInteger` for paging values).
- **`UpdateQuery` and `DeleteQuery` without `conditions` touch every row.**
- **Build fresh params for each `SelectQuery`.** The constructor modifies the `columns` you pass in.

## A complete repository

One repository class per table, each owning a `DBConnector`. This is the pattern all the examples above come from:

```typescript
import {
    DBConnector, DeleteQuery, ICount, InsertQuery, IOrders, IPreparedQuery, JoinType, OrderDirection,
    PostgreSQLConfig, QueryAggregateFunction, QueryOperator, SelectQuery, SelectQueryParams, UpdateQuery
} from "baby-elephant-orm";

export class ModuleRepo implements IModuleRepo {
    private databaseConnection: DBConnector;

    /**
     * @param connection Optional PostgreSQL config. Falls back to the default connection.
     */
    constructor(connection?: PostgreSQLConfig) {
        if (connection) {
            this.databaseConnection = new DBConnector(connection);
        } else {
            if (!DBConnection.CORE_CONNECTION) {
                throw new Error("Could not find PostgreSQL default database connection.");
            }
            this.databaseConnection = new DBConnector(DBConnector.createDatabaseConfig(DBConnection.CORE_CONNECTION));
        }
    }

    async create(module: Module): Promise<Module> { /* InsertQuery */ }
    async update(module: Module): Promise<Module> { /* UpdateQuery */ }
    async delete(moduleId: number): Promise<Module> { /* DeleteQuery */ }
    async getById(moduleId: number): Promise<Module> { /* SelectQuery + Module */ }
    async isModuleNameExist(moduleName: string, moduleId?: number): Promise<boolean> { /* SelectQuery, notEqual */ }
    async countAll(gridConfig?: IGridConfig): Promise<ICount> { /* aggregate */ }
    async getAll(gridConfig?: IGridConfig): Promise<IModules[]> { /* joins, paging, ordering, search */ }
}
```

Letting the constructor accept an optional config keeps the repository usable against a different database (a test database, or a second tenant) without touching any of the query code. The full method bodies are in the sections above.

| Task | Query class | Runs with | Returns |
| --- | --- | --- | --- |
| Read rows | `SelectQuery` | model class or type argument | matching rows |
| Add rows | `InsertQuery` | model class | inserted rows |
| Change rows | `UpdateQuery` | model class | updated rows |
| Remove rows | `DeleteQuery` | model class | deleted rows |

## API reference

### Classes

| Export | Description |
| --- | --- |
| `DBConnector` | Runs prepared queries on a shared connection pool. Static helpers: `createDatabaseConfig(jsonString)` and `disconnect()`. |
| `SelectQuery` | Builds a `SELECT` with columns, joins, conditions, ordering, limit and offset. |
| `InsertQuery` | Builds a single-row or multi-row `INSERT ... RETURNING *`. |
| `UpdateQuery` | Builds an `UPDATE ... RETURNING *`. |
| `DeleteQuery` | Builds a `DELETE ... RETURNING *`. |
| `ModelColumnProperyMapping` | Reads and converts a model's column/property mappings. |

All query classes expose `generateQuery(): IPreparedQuery`.

### Query params

| Type | Fields |
| --- | --- |
| `SelectQueryParams` | `tableSchema`, `columns?`, `conditions?`, `joins?`, `limit?`, `offset?`, `orders?`, `tableAlias?` |
| `InsertQueryParams` | `tableSchema`, `insertColumns`, `values` (one row, or an array of rows) |
| `UpdateQueryParams` | `tableSchema`, `updates`, `conditions?` |
| `DeleteQueryParams` | `tableSchema`, `conditions?` |

### Interfaces

| Type | Description |
| --- | --- |
| `IColumns` | A selected column: `columnName`, `tableSchema?`, `alias?`, `aggregateFunction?` (one or an array). |
| `ICondition` | `columnName`, `columnValue`, `operator`, `tableSchema?`. |
| `IJoin` | `tableSchema`, `tableAliasName?`, `joinType`, `joinCondition`. |
| `IJoinCondition` | `primaryTableSchema`, `primaryColumnName`, `operator`, `secondaryTableSchema`, `secondaryColumnName`. |
| `IUpdate` | `columnName`, `columnValue`, `updateIfNull?`. |
| `IOrders` | `columnName`, `modelKey`, `direction`, `aliasId?`. |
| `IPreparedQuery` | `{ query: string, params: unknown[] }`. |
| `ICount` | `{ count: number }`. |
| `IQueryParams` | The full set of params the query classes pick from. |
| `PostgreSQLConfig` | `user`, `host`, `database`, `password`, `port`, `rejectUnauthorized`, `caFile`, `clientCertFile`, `clientKeyFile`. |

### Enums

| Enum | Members |
| --- | --- |
| `JoinType` | `inner`, `left`, `right`, `full` |
| `OrderDirection` | `ascending`, `descending` |
| `QueryAggregateFunction` | `count`, `distinst`, `max`, `min` |
| `QueryOperator` | `equal`, `notEqual`, `greaterThan`, `lessThan`, `greaterThanOrEqual`, `lessThanOrEqual`, `like`, `iLike`, `in`, `isNull`, `isNotNull` |

## License

MIT License

Copyright (c) 2026 Krishna Tamakuwala

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
