## Structure

This is a monorepo with multiple packages. We have a frontend, a backend, a shared library `lib` and `lti` which is responsible for Learning Tools Interoperability functionality.
The frontend and backend use rest and websockets to communicate.

## Console

We are using windows powershell. Keep in mind that you cant use operators like `&&` or `||` in powershell. Use `;` instead. Before running the first console command, check the current directory with `pwd; ls`!

## Tests

- We are using Jest and yarn. Run `yarn test --testPathPattern "<relevant term>"`. Always change directory before running tests, for example `cd ./packages/server; yarn test`.
- Sometimes not the tests are the issue, but the implementation. When you think that the tests should work, take a look at the implementation to find the bug.

## Alyways do the following

Before starting to work, briefly summarize your task in one short sentence!
After implementing a feature, run the tests. If they fail, try to fix them based on the Test failures.
Only focus on the task given to you, do not modify unrelated code.
