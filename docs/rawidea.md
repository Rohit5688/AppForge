one more thing, check if we can create locator utils where we will store any kind of locators in yaml file e.g. submit_button: ios: ~submit
android: any locator which is supported
the locators will be picked on the platform being used to run the tests. eg. the sript should pic android locator for submit button when running on android emulator/device same for ios. this will be for new framework in case of existing we will follow whatever current framework is using as we are doing currently.
Support to run test scripts with tags
when scaffolding add required drivers type dependecies whicha re require to run the setp, think this throughly what all packages are required to run the test scripts and add them to the scaffold. eg. for cucumber we need to add cucumber, @cucumber/typescript-steps, ts-node, typescript, etc.

The whole idea is based on the face that the mcp tool is expecting basepage. which is not necessary every framework will have it.

whatever changes we are doing for setup, check if we need to do for repain and update as well.
the gaps written should be implemented end 2 end. consider which files we need to update on project to fill the gaps, just dont ask question and get answers. after getting answers, think and implement the changes end 2 end.


the changes we have planned and fix in past, if they are applicable to testforge, we should implement them in testforge as well. check history for reference.