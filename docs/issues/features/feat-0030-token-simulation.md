---
id: FEAT-0030
title: Add token simulation mode for BPMN diagrams
priority: medium
status: open
---

## Statement

Add a lightweight Token Simulation mode to BPMN Surf for interactive execution of BPMN diagrams directly inside the viewer.

The primary goal is to make process review and analysis easier without deploying the process to Camunda. A user should be able to open a BPMN diagram, start a simulation from a selected Start Event, and step through the process while observing token movement.

The first implementation should focus on visualization rather than accurate workflow engine execution.

## Context

The idea came from feedback after comparing BPMN Surf with the IntelliJ plugin "BPMN Editor", which includes a Token Simulation mode.

Although BPMN Surf is primarily used for GitLab Merge Request review, token simulation would also be valuable when simply viewing a BPMN diagram. A useful extension of this feature would be allowing BPMN Surf to open arbitrary BPMN files outside of Merge Requests.

Typical use case:

- reviewing a large process with multiple gateways and Call Activities;
- interactively exploring execution paths;
- validating routing logic without deploying the process.

Possible MVP:

- start simulation from a selected Start Event;
- step-by-step execution;
- visualization of active tokens;
- highlighting traversed Sequence Flows;
- support for:
  - Start/End Events;
  - Tasks;
  - Exclusive Gateways;
  - Parallel Gateways;
  - Call Activities (treated as a single node).

Token simalation should be implemented with https://github.com/bpmn-io/bpmn-js-token-simulation

Out of scope for the initial version:

- process variables;
- expression evaluation;
- timers, messages and signals;
- JavaDelegate/External Tasks;
- execution of nested Call Activities/SubProcesses;
- full Camunda-compatible execution semantics.

Future improvements:

- opening arbitrary local BPMN files;
- interactive gateway decision selection;
- simulation of subprocesses and Call Activities;
- integration with GitLab diagram view mode.

## Work log