export class PostgresClientNotProvidedError extends Error {
    constructor() {
        super("Postgres client is not provided or offline.");
        this.name = "PostgresClientNotProvidedError";
    }
}