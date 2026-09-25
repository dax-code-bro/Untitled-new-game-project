// Creative-mode catalog: things you can build inside the barrier.
#pragma once
#include "core/Math.h"
#include <string>
#include <vector>

namespace ps {

class Land;

enum class BuildKind {
    KennelBlock, DogRun, CatHouse, Path, Tree, Bench, LampPost, SecurityCamera, StaffBuilding, ParkingLot,
    SmallAnimalHouse, Barn, FeralEnclosure, SecureEnclosure, SurgeryWing, ContainerShelter, StaffOffices, PineTree, Shrub, Count
};

struct BuildInfo {
    const char* name;
    const char* category;
    float cost;
    float width, depth, height;   // footprint (x, z) before rotation, and height
    float appeal;                 // makes the place nicer (public rating)
    int visitorCapacity;          // extra visitors per day it lets you handle
    int animalCapacity;           // for the animals update
    float upkeepPerDay;
    bool solid;                   // blocks walking
    const char* description;
};
const BuildInfo& buildInfo(BuildKind k);

// Build-mode categories (the owner will spec each one in detail later)
enum class BuildCat { Pathways, Research, Structures, Trees, FencesGates, Client, Operations, Count };
const char* buildCatName(BuildCat c);
const char* buildCatPlan(BuildCat c);   // what's coming in that category
BuildCat buildCategory(BuildKind k);

struct Placed {
    int id = 0;
    BuildKind kind = BuildKind::Tree;
    float x = 0, z = 0;
    int rot = 0;                  // quarter turns (0..3)
    AABB bounds(float groundY) const;
};

// Areas you can't build on: the starting building, road, parking lot.
std::vector<AABB> reservedAreas();
bool validPlacement(BuildKind kind, float x, float z, int rot, const std::vector<Placed>& existing,
                    std::string* whyNot, const Land* land = nullptr);

}  // namespace ps
