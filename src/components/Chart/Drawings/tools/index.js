import { LineTool } from "./LineTool";
import { TrendTool } from "./TrendTool";
import { HorizontalLineTool } from "./HorizontalLineTool";
import { VerticalLineTool } from "./VerticalLineTool";
import { FibonacciTool } from "./FibonacciTool";
import { RectangleTool } from "./RectangleTool";

export function createToolById(id, defaultStyle) {
  switch (id) {
    case "line":
      return new LineTool(defaultStyle);
    case "trend":
      return new TrendTool(defaultStyle);
    case "horizontal":
      return new HorizontalLineTool(defaultStyle);
    case "vertical":
      return new VerticalLineTool(defaultStyle);
    case "fibonacci":
      return new FibonacciTool(defaultStyle);
    case "rectangle":
      return new RectangleTool(defaultStyle);
    default:
      return null;
  }
}
