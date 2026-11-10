#!/bin/bash
set -e
# Dependency setup must not execute package lifecycle migration hooks.
npm ci --ignore-scripts
# Database changes require a separate, reviewed operator migration.
# Never run a schema push automatically after a merge.
