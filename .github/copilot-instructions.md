## Structure

This is a monorepo with multiple packages. We have a frontend, a backend, a shared library `lib` and `lti` which is responsible for Learning Tools Interoperability functionality.
The frontend and backend use rest and websockets to communicate.

## Console

We are using windows powershell. Keep in mind that you cant use operators like `&&` or `||` in powershell. Use `;` instead. Before running the first command, check the current directory with `ls`.
