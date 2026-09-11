import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const modules = [
  { name: "Frontend", status: "ready" as const },
  { name: "Backend", status: "ready" as const },
  { name: "Simulation Engine", status: "prepared" as const },
  { name: "Optimization Layer", status: "prepared" as const },
];

export function ReadinessCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Project foundation ready</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {modules.map((module) => (
          <div key={module.name} className="flex items-center justify-between">
            <span className="text-sm">{module.name}</span>
            <Badge variant={module.status === "ready" ? "default" : "secondary"}>
              {module.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
