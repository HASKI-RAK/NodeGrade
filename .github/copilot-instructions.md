## Structure

This is a monorepo with multiple packages. We have a frontend, a backend, a shared library `lib` and `lti` which is responsible for Learning Tools Interoperability functionality.
The frontend and backend use rest and websockets to communicate.

## Console

Check the current os with `uname`.
If we are using windows powershell, keep in mind that you cant use operators like `&&` or `||` in powershell. Use `;` instead. Before running the first console command, check the current directory with `pwd; ls`!

## Tests

- We are using Jest and yarn. Run `yarn test --testPathPattern "<relevant term>"` for spec tests, `yarn test:e2e` for e2e tests. Always change directory before running tests, for example `cd ./packages/server; yarn test`.
- When you create a new test, make sure to eliminate all related errors before running.
- Sometimes not the tests are the issue, but the implementation. When you think that the tests should work, take a look at the implementation to find the bug.

## Alyways do the following

Before starting to work, briefly summarize your task in one short sentence!
Always check the problems of a given file.
After implementing a feature, run the tests. If they fail, try to fix them based on the Test failures.
Only focus on the task given to you, do not modify unrelated code.
If you are not sure about something, ask for help. Do not hesitate to ask for clarification or help if you are stuck.

## Coding guidelines

- Avoid casting types. Use the correct type from the beginning.
- Use best practices for the given language.
- Write clean code and use design patterns if appropriate to fix common problems.
- Write comments if the code is complex or not self-explanatory.
