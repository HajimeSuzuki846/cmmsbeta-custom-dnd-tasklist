---
name: mendix-widget-artifact-replacement
description: "Use when building, replacing, deploying, or copying a Mendix Pluggable Widget artifact (.mpk) into a Mendix project's widgets folder. Covers destination discovery across different PCs, safe replacement, backup, and verification."
---

# Mendix Widget Artifact Replacement

Mendix widget project build outputs must be copied into the target Mendix app's `widgets` folder. The app location varies by machine; never assume a machine-specific absolute path.

## Procedure

1. Identify the widget source workspace and the target Mendix app. Use the destination path supplied by the user or discover the open app's project root from the workspace. If the target is ambiguous or unavailable, ask for its project path before copying.
2. Inspect the widget repository's `package.json` scripts and build output. Build with the repository's documented command, then locate the matching `.mpk` by widget name/package identity. Do not select a similarly named artifact or copy intermediate JavaScript bundles.
3. Confirm the generated package exists and is newer than the source changes. Read the artifact name and version from the build output or package metadata when available.
4. Resolve the destination as `<target Mendix app>/widgets`. Confirm the folder exists and inspect the exact target `.mpk` before replacing it. Do not touch unrelated widgets.
5. If a matching artifact already exists, preserve a copy outside the destination `widgets` folder, using a timestamp or clear `previous` suffix. Then copy the newly built `.mpk` into `widgets` under its expected filename.
6. Verify the replacement by comparing source and destination file sizes and SHA-256 hashes. Report the source artifact, destination, backup location (if created), and verification result.
7. If Mendix Studio Pro is open, tell the user if it needs to reload or refresh the widget package. Do not modify project configuration or publish/deploy the app unless explicitly requested.

## Safety

- A user-provided project path is machine-specific input, not a reusable default. Do not write it into this skill or hard-code it in scripts.
- Never overwrite an artifact until the target app and exact widget package have been confirmed.
- Do not delete the old package or backup as part of replacement.
