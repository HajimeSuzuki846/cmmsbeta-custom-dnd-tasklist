/**
 * This file was generated from CustomDnDTaskList.xml
 * WARNING: All changes made to this file will be overwritten
 * @author Mendix Widgets Framework Team
 */
import { CSSProperties } from "react";
import { ActionValue, ListValue, Option, ListActionValue, ListAttributeValue, ListReferenceValue } from "mendix";
import { Big } from "big.js";

export interface CustomDnDTaskListContainerProps {
    name: string;
    class: string;
    style?: CSSProperties;
    tabIndex?: number;
    sections?: ListValue;
    sectionNameAttribute?: ListAttributeValue<string>;
    tasks: ListValue;
    taskSection?: ListReferenceValue;
    sortOrderAttribute: ListAttributeValue<Big>;
    taskNameAttribute?: ListAttributeValue<string>;
    taskDescriptionAttribute?: ListAttributeValue<string>;
    descriptionMaxLines: number;
    onTaskDetail?: ListActionValue;
    onTaskDelete?: ListActionValue;
    onInlineAddTask?: ListActionValue<{ newTaskTitle: Option<string> }>;
    onTaskTitleCommitted?: ListActionValue<{ newTitle: Option<string> }>;
    onTaskDescriptionCommitted?: ListActionValue<{ newDescription: Option<string> }>;
    onPersistSortOrder?: ActionValue<{ sortOrderPayload: Option<string> }>;
    onSortOrderChanged?: ActionValue;
}

export interface CustomDnDTaskListPreviewProps {
    /**
     * @deprecated Deprecated since version 9.18.0. Please use class property instead.
     */
    className: string;
    class: string;
    style: string;
    styleObject?: CSSProperties;
    readOnly: boolean;
    renderMode: "design" | "xray" | "structure";
    translate: (text: string) => string;
    sections: {} | { caption: string } | { type: string } | null;
    sectionNameAttribute: string;
    tasks: {} | { caption: string } | { type: string } | null;
    taskSection: string;
    sortOrderAttribute: string;
    taskNameAttribute: string;
    taskDescriptionAttribute: string;
    descriptionMaxLines: number | null;
    onTaskDetail: {} | null;
    onTaskDelete: {} | null;
    onInlineAddTask: {} | null;
    onTaskTitleCommitted: {} | null;
    onTaskDescriptionCommitted: {} | null;
    onPersistSortOrder: {} | null;
    onSortOrderChanged: {} | null;
}
