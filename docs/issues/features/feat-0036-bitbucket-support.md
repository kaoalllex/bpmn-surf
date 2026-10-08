---
id: FEAT-0036
title: Bitbucket support
priority: low
status: open
---

## Statement

Make the extension work on Bitbucket the way it works on GitLab: the diff buttons on
`.bpmn` / `.dmn` files of a pull request, viewing a diagram from the repository, diving into
called processes and decisions, and the jumps to handler code.

Comes after GitHub: [REFAC-0004] builds the provider abstraction and the GitHub provider;
Bitbucket is then one more provider plus its UI decorator, with no changes to the core.

Decide before starting which flavours to cover — they have different page markup and APIs:

- **Bitbucket Cloud** (`bitbucket.org`): one public host, REST API 2.0;
- **Bitbucket Data Center** (self-hosted; Server reached end of life in February 2024):
  REST API 1.0, a host the user adds from the popup, as with a self-managed GitLab.

Code search differs most: Cloud has a code search API, Data Center needs its search to be
configured on the instance (OpenSearch/Elasticsearch). The jumps that rely on code search
may have to degrade there, the way they do on gitlab.com for a signed-out user.

## Context

- New host permissions must follow the popup's optional-host flow; adding `bitbucket.org` to
  the manifest is a new permission with a warning for store users.

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->
