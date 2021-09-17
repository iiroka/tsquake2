import {Qcommon_Init} from "./common/frame";

console.log("Hello World!");
Qcommon_Init().then( () =>
    console.log("DONE")
).catch( () =>
    console.log("ERROR")
)
