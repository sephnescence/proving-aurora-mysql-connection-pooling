export interface ProcesslistRow {
    ID: number;
    USER: string;
    HOST: string;
    DB: string | null;
    COMMAND: string;
    TIME: number;
    STATE: string | null;
    INFO: string | null;
}
