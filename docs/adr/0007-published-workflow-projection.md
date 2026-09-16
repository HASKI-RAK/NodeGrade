# ADR-0007: Published workflow projection

Status: accepted

An LTI resource owns one workspace and workflow. Instructors edit `content`; publishing snapshots it into `publishedContent` without changing the edit version. Student launches read the published projection. This preserves the instructor-to-student release gate within the workspace model.
