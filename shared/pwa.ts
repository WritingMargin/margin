export interface PWASettings {
  showInstallButton: boolean;
  name: string;
  shortName: string;
  icon: string;
  themeColor: string;
  backgroundColor: string;
  startPage: "blog" | "workspace";
}

export const defaultPWASettings: PWASettings = {
  showInstallButton: false,
  name: "",
  shortName: "",
  icon: "",
  themeColor: "",
  backgroundColor: "",
  startPage: "blog",
};

export interface PublicPWA {
  showInstallButton: boolean;
  name: string;
}
