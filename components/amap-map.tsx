"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, MapPin } from "lucide-react";

export type MapResource = {
  id: string;
  type: "达人" | "团长";
  name: string;
  channel: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
};

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

let loader: Promise<any> | null = null;
function loadAmap(key: string, securityCode: string) {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (!loader) {
    window._AMapSecurityConfig = { securityJsCode: securityCode };
    loader = new Promise((resolve, reject) => {
      const callback = `amapReady_${Date.now()}`;
      (window as any)[callback] = () => {
        delete (window as any)[callback];
        resolve(window.AMap);
      };
      const script = document.createElement("script");
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&callback=${callback}&plugin=AMap.Geocoder,AMap.ToolBar,AMap.Scale,AMap.MarkerCluster`;
      script.onerror = () => reject(new Error("高德地图脚本加载失败"));
      document.head.appendChild(script);
    });
  }
  return loader;
}

export default function AmapMap({
  resources,
  onSelect,
}: {
  resources: MapResource[];
  onSelect: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const key = process.env.NEXT_PUBLIC_AMAP_KEY || "";
  const securityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE || "";

  useEffect(() => {
    if (!key || !securityCode) {
      setState("missing");
      return;
    }
    let cancelled = false;
    let cluster: any;
    loadAmap(key, securityCode)
      .then(async (AMap) => {
        if (cancelled || !host.current) return;
        const map = new AMap.Map(host.current, {
          zoom: 4.4,
          center: [104.195397, 35.86166],
          viewMode: "2D",
          resizeEnable: true,
        });
        mapRef.current = map;
        map.addControl(
          new AMap.ToolBar({ position: { right: "18px", top: "18px" } }),
        );
        map.addControl(new AMap.Scale());
        const geocoder = new AMap.Geocoder({ city: "全国" });
        const points: { resource: MapResource; position: [number, number] }[] =
          [];
        for (const resource of resources.slice(0, 500)) {
          if (cancelled) return;
          if (resource.longitude != null && resource.latitude != null) {
            points.push({
              resource,
              position: [Number(resource.longitude), Number(resource.latitude)],
            });
            continue;
          }
          const address = [
            resource.province,
            resource.city,
            resource.district,
            resource.address,
          ]
            .filter(Boolean)
            .join("");
          if (!address) continue;
          const position = await new Promise<[number, number] | null>(
            (resolve) => {
              geocoder.getLocation(address, (status: string, result: any) => {
                const geocode =
                  status === "complete" ? result?.geocodes?.[0] : null;
                const location = geocode?.location;
                if (location) {
                  void fetch("/api/map-locations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id: resource.id.replace(/^(talent|leader)-/, ""),
                      type: resource.type,
                      longitude: location.lng,
                      latitude: location.lat,
                      precision: geocode.level || "geocoded",
                    }),
                  });
                }
                resolve(location ? [location.lng, location.lat] : null);
              });
            },
          );
          if (position) points.push({ resource, position });
        }
        const markers = points.map(({ resource, position }) => {
          const marker = new AMap.Marker({
            position,
            title: resource.name,
            extData: resource,
            content: `<div class="amap-resource-marker ${resource.type === "团长" ? "leader" : "talent"}">${resource.type === "团长" ? "团" : "达"}</div>`,
          });
          marker.on("click", () => {
            onSelect(resource.id);
            const info = new AMap.InfoWindow({
              offset: new AMap.Pixel(0, -26),
              content: `<div class="amap-info"><b>${escapeHtml(resource.name)}</b><span>${resource.type} · ${escapeHtml([resource.province, resource.city, resource.district, resource.address].filter(Boolean).join(" ") || "位置已记录")}</span></div>`,
            });
            info.open(map, position);
          });
          return marker;
        });
        if (markers.length) {
          cluster = new AMap.MarkerCluster(map, markers, {
            gridSize: 60,
            maxZoom: 15,
          });
          map.setFitView(markers, false, [60, 60, 60, 60], 12);
        }
        if (!cancelled) {
          setMessage(`已定位 ${markers.length} 个资源`);
          setState("ready");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error.message || "地图加载失败");
          setState("error");
        }
      });
    return () => {
      cancelled = true;
      cluster?.setMap?.(null);
      mapRef.current?.destroy?.();
      mapRef.current = null;
    };
  }, [key, securityCode, resources, onSelect]);

  return (
    <div className="amap-shell">
      <div ref={host} className="amap-host" />
      {state !== "ready" && (
        <div className="amap-state">
          {state === "missing" ? (
            <>
              <MapPin size={30} />
              <b>地图服务待配置</b>
              <span>
                配置高德 Web 端 JS API Key 与安全密钥后即可显示全国完整地图
              </span>
            </>
          ) : (
            <>
              <AlertCircle size={30} />
              <b>
                {state === "loading" ? "正在加载全国地图…" : "地图加载失败"}
              </b>
              <span>{message}</span>
            </>
          )}
        </div>
      )}
      {state === "ready" && (
        <div className="map-watermark">
          <MapPin size={16} />
          {message}
        </div>
      )}
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ] || char,
  );
}
