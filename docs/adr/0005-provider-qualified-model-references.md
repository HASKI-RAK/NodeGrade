# ADR-0005: Provider-qualified model references

Status: accepted

Serialized model choices use `{ providerKey, modelId }`. Reserved provider keys are shared by the library, seeder, and migration. Legacy model fields remain during Wave 1 for editor compatibility. Ambiguous legacy selections require explicit selection.
