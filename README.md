# NodeGrade (automatic short answer grading tool)

## Overview

This repository provides an app for automated task evaluation. Using an intuitive node graph interface, users can create and configure tasks, which are then evaluated by a by the system. The system consults worker units if necessary. The worker units are models hosted using the openAPI standard.

Following articles have been published concerning this project:

- [Enhancing NLP-Based Educational Assessment: A Node-Based Graph Approach for Analyzing Freeform Student Texts](https://ieeexplore.ieee.org/document/10569607)

---

This mono repository, named `NodeGrade`, is designed to encompass a server, a frontend Progressive Web Application (PWA) developed in React, and a shared library package.
Created and maintained by David Fischer.

![Thumbnail](.github/thumbnail.png)

## Getting Started

### Prerequisites

- Node.js 18 or later
- Yarn 4 (or Corepack)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/HASKI-RAK/NodeGrade.git
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```
3. Create a `.env` file in the `packages/backend` directory and add the following content:
   ```bash
   DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/DATABASENAME?schema=public"
   ```
   Replace the connection string with your own database connection string.
4. Generate the Prisma client and apply the migrations:
   ```bash
   yarn setup
   ```

### Running the Project

To run the project in a development environment, use the following command in the root directory:

```bash
yarn dev
```

This will launch both the server and the frontend PWA in development mode.

### Workshop flow

Facilitators sign in at `/admin`, create a workshop from a published template revision,
and publish its eight-character code. Participants enter the code at `/` or open
`/workshop/<code>`; each browser receives an isolated workspace and workflow copy.

Workflow persistence uses REST with optimistic version checks. Graph execution uses
Socket.IO and a workspace-scoped workflow ID.

### Benchmarking

Facilitator-authenticated benchmark runs use `POST /api/benchmark/run` with the following body:

```json
{
  "workflowId": "<workflow-id>",
  "data": {
    "question": "What is 1+1?",
    "realAnswer": "2",
    "answer": "2"
  }
}
```

The request uses the facilitator session and CSRF header from the admin API.

> Note: The graph has to have the following nodes for the benchmark to work: "Answer Input", "question", "feedback output". You can use multiple of these nodes.

## Structure

The project is structured into multiple workspaces located under `packages/*`, enabling seamless integration and development of the individual components.

### Server

The server component, implemented in TypeScript, stores workspace-scoped workflows with [Prisma](https://www.prisma.io/) and PostgreSQL. REST handles persistence while WebSockets stream graph execution events.

### Frontend PWA

Developed in React, the frontend PWA offers a responsive and interactive user experience. It provides a node editor for creating and configuring tasks. Users see a form for submitting their solution to the task, which is then evaluated by the server.

### Library Package

The library package includes shared resources and utilities used across the server and the frontend PWA. These include node types and websocket message types.

## Example Usage

1. Run `yarn debug:up`.
2. Open <http://localhost:15173/>.
3. Join the seeded workshop with code `WAVE-2026`.
4. Edit the workflow and wait for the `Saved` indicator.

## Docker

`yarn debug:up` starts PostgreSQL, the backend, frontend, and deterministic
OpenAI-compatible model worker. `yarn debug:down` stops the stack and
`yarn debug:reset` recreates its database.

## Scripts

- **Development**: `yarn dev` - Runs both the server and frontend in development mode.
- **Lint**: `yarn lint` - Lints the codebase for both the server and frontend.
- **Unit tests**: `yarn test` - Runs backend and frontend tests.
- **Database integration**: `yarn test:int` - Checks PostgreSQL constraints.
- **Browser smoke tests**: `yarn test:e2e` - Exercises the workshop flow.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Citation
If you use this work, pleace cite the corresponding paper:
```bib
@inproceedings{10.1145/3723010.3723021,
author = {Fischer, David Vincent and Haug, Jim and Schoppel, Paul and Abke, J\"{o}rg and Becker, Matthias and Hagel, Georg},
title = {Evaluation of a Node-based Automatic Short Answer Tool “NodeGrade”},
year = {2025},
isbn = {9798400712821},
publisher = {Association for Computing Machinery},
address = {New York, NY, USA},
url = {https://doi.org/10.1145/3723010.3723021},
doi = {10.1145/3723010.3723021},
abstract = {NodeGrade tries to provide a suitable solution for the problem of time-intensive short answer grading. This research focuses simultaneously on performance, functionality and user experience, which is underlined by a triangulated approach. The evaluation results show comparable performance of NodeGrade on public datasets, even outperforming GPT-4 on the SemEval 2013 Task 7. Matching of NodeGrade’s output with multiple human expert raters reveals some weaknesses regarding cases at the lower and upper boundary. In terms of user experience, the interviewed and observed students recognized both positive facets, like better learning support and helpful feedback, and negative sides, including technical limitations and lack of transparency. Overall, NodeGrade promises high potential for further practical use and testing in the field of software engineering education and automatic short answer grading.},
booktitle = {Proceedings of the 6th European Conference on Software Engineering Education},
pages = {20–29},
numpages = {10},
keywords = {ASAG, Automatic Short Answer Grading, Short Answer Scoring, AI in Education, Software Engineering Education, Natural Language Processing, Large Language Models},
location = {
},
series = {ECSEE '25}
}
```
Which can also be found at: https://dl.acm.org/doi/10.1145/3723010.3723021
### Credits

Porter Stemmer by Martin Porter 1980, used under the MIT License. Implementation from [James Aylett](https://tartarus.org/martin/PorterStemmer/js.txt) under the [copyright](https://tartarus.org/copyright). License noted in script.

### Tags
NodeGrade, ASAG, ASAG-F, automatic short answer grading, automatic short answer grading with feedback, freeform text grading, TAAB, task based automatic assessment
