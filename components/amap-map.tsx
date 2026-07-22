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
  selectedId,
}: {
  resources: MapResource[];
  onSelect: (id: string) => void;
  selectedId?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef(new Map<string, any>());
  const infoRef = useRef<any>(null);
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
            anchor: "bottom-center",
            offset: new AMap.Pixel(0, -3),
            title: resource.name,
            extData: resource,
            content: markerContent(resource),
            zIndex: resource.type === "团长" ? 120 : 110,
          });
          const openDetails = () => {
            onSelect(resource.id);
            const info = new AMap.InfoWindow({
              offset: new AMap.Pixel(0, -26),
              content: `<div class="amap-info"><b>${escapeHtml(resource.name)}</b><span>${resource.type} · ${escapeHtml(channelLabel(resource.channel))}</span></div>`,
            });
            infoRef.current?.close?.();
            infoRef.current = info;
            info.open(map, position);
          };
          marker.on("click", openDetails);
          (marker as any).__openDetails = openDetails;
          markerRef.current.set(resource.id, marker);
          return marker;
        });
        if (markers.length) {
          if (markers.length > 50) {
            cluster = new AMap.MarkerCluster(map, markers, {
              gridSize: 50,
              maxZoom: 13,
            });
          } else {
            map.add(markers);
          }
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
      markerRef.current.clear();
      mapRef.current?.destroy?.();
      mapRef.current = null;
    };
  }, [key, securityCode, resources, onSelect]);

  useEffect(() => {
    if (!selectedId || !mapRef.current) return;
    const marker = markerRef.current.get(selectedId);
    if (!marker) return;
    mapRef.current.setZoomAndCenter(16, marker.getPosition(), false, 350);
    window.setTimeout(() => marker.__openDetails?.(), 380);
  }, [selectedId]);

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

function markerContent(resource: MapResource) {
  const color = resource.type === "团长" ? "#0cab7c" : "#6557e8";
  return `<div style="display:flex;align-items:center;gap:5px"><div style="width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 3px 9px rgba(30,25,65,.28);font-size:10px;font-weight:700">${resource.type === "团长" ? "团" : "达"}</div><span style="padding:3px 6px;border-radius:5px;background:rgba(255,255,255,.97);color:#29253b;font-size:12px;font-weight:700;white-space:nowrap;border:1px solid #e8e5f2;box-shadow:0 3px 9px rgba(30,25,65,.18)">${escapeHtml(resource.name)}</span></div>`;
}

function channelLabel(channel: string | null) {
  return (
    ({ jd: "京东", douyin: "抖音", tmall: "天猫" } as Record<string, string>)[
      channel || ""
    ] || "未设置渠道"
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
