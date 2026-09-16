# ADR-0001: Workspace access tokens

Status: accepted

Anonymous browser and workshop workspaces use 256-bit opaque bearer tokens. The database stores SHA-256 hashes. HTTP guards and Socket.IO middleware derive workspace identity from the credential; workspace IDs remain public identifiers. LTI sessions derive identity from a signed, HTTP-only launch cookie and stable LTI key.
