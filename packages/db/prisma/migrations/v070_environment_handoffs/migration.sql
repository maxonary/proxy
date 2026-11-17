CREATE TABLE "EnvironmentHandoff" (
 "tokenHash" TEXT PRIMARY KEY, "oauthGrantId" TEXT NOT NULL REFERENCES "OAuthGrant"("id") ON DELETE CASCADE, "agentId" TEXT NOT NULL REFERENCES "Agent"("id") ON DELETE CASCADE,
 "project" TEXT NOT NULL, "names" TEXT[] NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "EnvironmentHandoff_expiresAt_idx" ON "EnvironmentHandoff"("expiresAt");
