# proving-aurora-mysql-connection-pooling
Seeing if I can prove connection pooling in Amazon RDS Aurora for MySQL

The work involved in this project will see the creation of multiple cloudformation stacks. Each github workflow will have their own IAM role, which will need to be deployed manually first.

Each github action will need to have access to the following github secret - AWS_ACCOUNT_ID. This needs to be added to the github repository secrets manually.

The Github Repository will also need to be set up to require branch protection rules for the main branch. This will need to be done manually.

---

## Q&A

**Is there a CLI command to create `pnpm-workspace.yaml`?**
No. `pnpm init` only generates `package.json`. The workspace config file must be created manually.

**Why is `"module"` set to `"CommonJS"` in `tsconfig.base.json` if we're using TypeScript?**
NestJS requires CommonJS. The `"module"` setting only controls what the *compiled JavaScript output* looks like — it does not affect TypeScript syntax. You still write `import`, `export default`, `import type`, etc. throughout the codebase. TypeScript transpiles these into `require()`/`module.exports` calls in the compiled `.js` files, which you never see.

**Does `"module": "CommonJS"` mean I can't use `import`, `export default`, or `import type`?**
No. Those are TypeScript syntax and work regardless of the `module` setting. The setting only affects the compiled output.

**Why does my IDE show an Angular icon next to `*.service.ts` files?**
NestJS deliberately adopts Angular's file naming conventions (`*.service.ts`, `*.module.ts`, `*.controller.ts`, kebab-case filenames). From the official NestJS docs: *"The architecture is heavily inspired by Angular."* The Angular icon from your IDE's file icon theme is expected and correct.

**What does `@Injectable()` do?**
It marks the class as a NestJS provider, meaning NestJS's dependency injection container knows about it and can instantiate it and inject it into other classes (like controllers) via their constructors. Without it, NestJS cannot resolve the class when something asks for it.

**How do you add a script to `package.json` without editing the file directly?**
Use `pnpm pkg set`:
```bash
pnpm pkg set scripts.format="prettier --write ."
```
