export interface Project {
    id: string;
    userId: string;
    name: string;
    colorAccent: string;
    emoji: string | null;
    createdAt: string;
}

export interface CreateProjectInput {
    name: string;
    colorAccent?: string;
    emoji?: string;
}
