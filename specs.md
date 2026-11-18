# Icelandic Alpine Ski Racer Dashboard

A simple HTML app for monitoring what icelandic alpine ski racers are doing throughout the season.

## Problem statement
The FIS website has very limited observability and difficult user interface. I want to create an app centered around icelandic skiers that give be the overview I need to follow what is happening throughout the season.

## Scope
- All active icelandic alpine skiers in FIS

## Goals
G1. I can see the current rankings and fis points of Icelandic alpine ski racers of both genders
G2. I can select an athlete and get an indepth analytics 
G3. I can select two athletes and compare them
G4. I can see a feed of the most recent results of icelandic skiers


## Requirements
R1. **Athlete tables** there should be one table for each gender that I can toggle bwtween. The tables should list all active ski racers and show their rankings and fis points in each discipline, birth year.
R2. **Athlete Profiles** from the athlete tables I can select and athlete to visit a profile that shows an analytical profile for the athlete, containing the analytics from comparison_is.html.
R3. **Athlete Comparison** from an athletes profile I can choose other athletes to compare, which opens a combine athlete profile like the comparison_is.html
R4. **Race Feed** there should be a race feed that shows the most recent race results with fis-points, rank, country, place, discipline, date.
R5. **Link to race on FIS** by clicking a race from the feed I'm directed to the race on www.fis-ski.com.

## Style
Use the style described in the STYLE.md