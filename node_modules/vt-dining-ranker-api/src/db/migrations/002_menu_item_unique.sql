ALTER TABLE menu_item ADD CONSTRAINT menu_item_unique_per_hall_date_period
  UNIQUE (dining_hall_id, name, meal_period, menu_date);
