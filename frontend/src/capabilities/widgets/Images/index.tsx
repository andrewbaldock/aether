import { registerRenderer } from "../../registry";
import { ImagesWidget } from "./ImagesWidget";

registerRenderer("images", ImagesWidget);

export const IMAGES_WIDGET = {
  id: "images",
  type: "images",
  title: "Images",
  state: null,
} as const;
