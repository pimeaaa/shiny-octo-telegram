# Architectural Decisions Log

This file tracks important changes and why they were made.

## Job ID Format
Changed to:
DD-MM-YYYY--HH-mm-ss_title

Reason:
Readable, sortable, stable.

## Scripts are Audio Only
We removed [Visual:] from scripts.

Reason:
Visual planning belongs to storyboard step, not script generation.

## Beat-Based Editing
We decided against word-by-word generation.

Reason:
Cost control and better pacing.

## CLI prints next suggested command
We decided each CLI step should print a copy paste friendly "Next:" command after success.

Reason:
Speeds up iteration, reduces mistakes when running steps manually, and supports a smooth terminal workflow before adding any UI.

## Scripts are audio only (no [Visual:])
We removed visual direction lines from script generation output.

Reason:
Visual planning belongs to the storyboard step, which keeps the pipeline modular and allows us to reuse the same scripts with different visual styles.

## Character profile controls style, not hardcoded constants
Character styleLock and referenceImages are stored in assets/characters/<id>/profile.json and referenced from job.json (job.character.profilePath).

Reason:
Enables swapping characters and future admin panel tweaking without refactoring pipeline code.

## Image generation uses reference images when possible
We aim to condition image generation on character reference images.

Reason:
Improves character consistency across panels and across videos, reduces drift over time.
