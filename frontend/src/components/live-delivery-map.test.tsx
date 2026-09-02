import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@/test/render";

const mockMarkerInstance = {
  setLngLat: vi.fn().mockReturnThis(),
  addTo: vi.fn().mockReturnThis(),
};
const mockMapInstance = {
  panTo: vi.fn(),
  remove: vi.fn(),
};
// Regular `function` expressions, not arrows — mapbox-gl's `Map`/`Marker` are called with `new`,
// and an arrow-function-backed `vi.fn()` mock can't be invoked as a constructor.
const MapMock = vi.fn(function Map() {
  return mockMapInstance;
});
const MarkerMock = vi.fn(function Marker() {
  return mockMarkerInstance;
});

vi.mock("mapbox-gl", () => ({
  default: {
    Map: MapMock,
    Marker: MarkerMock,
    accessToken: "",
  },
}));
vi.mock("mapbox-gl/dist/mapbox-gl.css", () => ({}));

// `LiveDeliveryMap` reads `NEXT_PUBLIC_MAPBOX_TOKEN` as a module-level const (matching how
// Next.js statically replaces `process.env.NEXT_PUBLIC_*` at build time) — to test both the
// token-present and token-absent branches, the module has to be re-imported fresh after
// changing the env var, since a plain re-render wouldn't re-evaluate that const.
async function importFresh() {
  vi.resetModules();
  return import("./live-delivery-map");
}

describe("LiveDeliveryMap", () => {
  const originalToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  beforeEach(() => {
    MapMock.mockClear();
    MarkerMock.mockClear();
    mockMapInstance.panTo.mockClear();
    mockMapInstance.remove.mockClear();
    mockMarkerInstance.setLngLat.mockClear();
    mockMarkerInstance.addTo.mockClear();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = originalToken;
  });

  it("renders nothing when no token is configured — degrades to the caller's Stepper", async () => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "";
    const { LiveDeliveryMap } = await importFresh();

    const { container } = render(<LiveDeliveryMap riderLocation={null} />);

    expect(container).toBeEmptyDOMElement();
    expect(MapMock).not.toHaveBeenCalled();
  });

  it("renders the map and a waiting message when a token is set but no location has arrived yet", async () => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "test-token";
    const { LiveDeliveryMap } = await importFresh();

    render(<LiveDeliveryMap riderLocation={null} />);

    expect(MapMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Waiting for the rider/)).toBeInTheDocument();
  });

  it("adds a destination marker when one is provided, and no rider marker yet", async () => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "test-token";
    const { LiveDeliveryMap } = await importFresh();

    render(<LiveDeliveryMap riderLocation={null} destination={{ lat: 6.5, lng: 3.4 }} />);

    expect(MarkerMock).toHaveBeenCalledTimes(1);
    expect(mockMarkerInstance.setLngLat).toHaveBeenCalledWith([3.4, 6.5]);
  });

  it("adds a rider marker and pans the map once a rider location is known, without the waiting message", async () => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "test-token";
    const { LiveDeliveryMap } = await importFresh();

    render(<LiveDeliveryMap riderLocation={{ lat: 6.6, lng: 3.5 }} />);

    expect(MarkerMock).toHaveBeenCalledTimes(1);
    expect(mockMapInstance.panTo).toHaveBeenCalledWith([3.5, 6.6]);
    expect(screen.queryByText(/Waiting for the rider/)).not.toBeInTheDocument();
  });

  it("moves the existing rider marker instead of creating a new one when the location updates", async () => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "test-token";
    const { LiveDeliveryMap } = await importFresh();

    const { rerender } = render(<LiveDeliveryMap riderLocation={{ lat: 6.6, lng: 3.5 }} />);
    expect(MarkerMock).toHaveBeenCalledTimes(1);

    rerender(<LiveDeliveryMap riderLocation={{ lat: 6.7, lng: 3.6 }} />);

    expect(MarkerMock).toHaveBeenCalledTimes(1); // still just the one marker instance
    expect(mockMarkerInstance.setLngLat).toHaveBeenLastCalledWith([3.6, 6.7]);
  });
});
