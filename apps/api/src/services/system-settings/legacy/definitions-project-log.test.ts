import { expect, test } from "bun:test";
import { SETTING_DEFINITIONS } from "./definitions";
test("project communication and internal retirement have separate closed platform defaults", () => {
 for(const key of ["PROJECT_LOG_COMMUNICATION_ENABLED","PROJECT_LOG_INTERNAL_COMMENTS_RETIRED"]){
  expect(SETTING_DEFINITIONS.filter(item=>item.key===key)).toHaveLength(1);
  expect(SETTING_DEFINITIONS.find(item=>item.key===key)).toMatchObject({valueType:"boolean",defaultValue:"false",groupCode:"project_log"});
 }
});
