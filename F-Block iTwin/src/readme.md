# Using Viewer Packages Sample

Copyright © Bentley Systems, Incorporated. All rights reserved.

This sample shows a small selection of UI provider packages available on npm.

## UI Provider Packages
The App UI API controls the UI interface of the Viewer application. This sample contains a small selection of packages on npm powered by App UI that you can include in your application. You can also use the App UI API directly and even create your own UI provider packages (look for the App UI section on the [samples page](https://developer.bentley.com/samples/) to learn how to do that). This is the list of UI provider packages included in this sample:
-	[Tree View Widget](https://www.npmjs.com/package/@itwin/tree-widget-react): A tree Widget that allows you to view an interact with your iModel’s Models and Categories.
-	[Property Grid Widget](https://www.npmjs.com/package/@itwin/property-grid-react): A grid widget that lets you view the properties of your iModel’s elements. It appears on element selection.
-	[Measure Tools](https://www.npmjs.com/package/@itwin/measure-tools-react): Measurement tools that you can use within the Viewer component.
-	Selection/Content Tools: Tools that allow you to select elements in your iModel and perform various actions on the content of the Viewer. Included in the Viewer package.
-	Navigation Tools: Tools that allow you to navigate your iModel. Included in the Viewer package.
-	Status Bar Items: The standard status bar that used to appear on all Viewer applications. Included in the Viewer package.

## Going from Viewer Version 2.x to 3.x
In Viewer version 2.x and below, the Viewer component contained a variety of UI items by default. These items needed to be opted-out of for them to not appear in your app.

In Viewer version 3.x and above, the logic was flipped so that those UI items now needed to be “opted-into” by manually adding their packages to the Viewer.

More details can be found [in the changelogs]( https://github.com/iTwin/viewer/blob/master/releases/CHANGELOG-3.0.md) for Viewer version 3.x.
