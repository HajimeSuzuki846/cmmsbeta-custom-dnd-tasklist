import { ReactElement } from "react";
import { TaskDnDList } from "./components/TaskDnDList";
import { CustomDnDTaskListContainerProps } from "../typings/CustomDnDTaskListProps";

import "./ui/CustomDnDTaskList.css";

export function CustomDnDTaskList(props: CustomDnDTaskListContainerProps): ReactElement {
    return <TaskDnDList {...props} />;
}
