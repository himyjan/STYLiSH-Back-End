/* eslint-disable no-undef */
const express = require('express');
// const mysql = require('mysql2');
const router = express.Router();
const bodyParser = require('body-parser');

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));
const redis = require('redis');
const { query } = require('../../util/mysqlcon');

const REDIS_PORT = process.env.REDIS_PORT || 6379;
const client = redis.createClient(REDIS_PORT);

client.on('error', (error) => {
  console.error(error);
});

function cache(req, res, next) {
  const queryId = req.query.id;
  const { category } = req.params;
  if (client.ready && category === 'details') {
    client.get(queryId, (err, data) => {
      if (err) { throw err; }
      if (data !== null) {
        res.json(JSON.parse(data));
      } else {
        next();
      }
    });
  } else {
    next();
  }
}

router.get('/:category', cache, async (req, res) => {
  const { paging } = req.query; //  ? paging  key / 0.1.2.3....
  const { keyword } = req.query;
  const queryId = req.query.id;
  const { category } = req.params; //  /: params
  const categories = ['all', 'women', 'men', 'accessories'];

  let products_sql;

  // set function
  const getJSONs = async function (ids, products) {
    // insert images
    const selectOtherImage = `select images_url, id from otherimages where id in (${ids})`;
    const images_sql_result = await query(selectOtherImage);
    for (p of products) {
      const images = [];
      for (i of images_sql_result) {
        if (p.id === i.id) {
          delete i.id;
          images.push(i.images_url);
        }
      }
      p.images = images;
    }

    // insert colors
    // add error handler later
    // rewrite sql query
    const colors_sql = `select distinct color_name, color_code ,id from variant where id in (${ids});`;
    const colors_result = await query(colors_sql);

    for (p of products) {
      const colors = [];
      for (c of colors_result) {
        if (p.id === c.id) {
          c.code = c.color_code;
          c.name = c.color_name;
          delete c.id;
          delete c.color_name;
          delete c.color_code;
          colors.push(c);
        }
      }
      p.colors = colors;
    }
    // insert sizes
    const sizes_sql = `select distinct size ,id from variant where id in (${ids});`;
    const sizes_result = await query(sizes_sql);
    for (p of products) {
      const sizes = [];
      for (s of sizes_result) {
        if (p.id === s.id) {
          delete s.id;
          sizes.push(s.size);
        }
      }
      p.sizes = sizes;
    }
    // insert variants
    const variants_sql = `select color_code , size ,stock ,id from variant where id in (${ids});`;
    const variants_result = await query(variants_sql);

    for (p of products) {
      const variants = [];
      for (v of variants_result) {
        if (p.id === v.id) {
          delete v.id;
          variants.push(v);
        }
      }
      p.variants = variants;
    }

    let pages_sql;
    if (category === 'all') {
      pages_sql = 'select count(id) as number from product';
    } else if (category == 'men' || category == 'women' || category == 'accessories') {
      pages_sql = `select count(id) as number from product where category ='${category}'`;
    } else if (category == 'search') {
      pages_sql = `select count(id) as number from product where title like '%${keyword}%' ;`;
    } else if (category == 'details') {
      pages_sql = `select count(id) as number from product where title like '%${queryId}%' ;`;
    }
    const pages_result = await query(pages_sql);
    const next_paging_check = pages_result[0].number / 6 - paging;
    const final_output = {};
    final_output.data = products;
    const nextpaging = `${parseInt(paging) + 1}`;

    if (next_paging_check > 1) {
      final_output.next_paging = nextpaging;
      res.json(final_output);
    } else if (category === 'details') {
      const detail_output = {};
      detail_output.data = products[0];
      if (client.ready) {
        client.setex(queryId, 3600, JSON.stringify(detail_output));
      }
      res.json(detail_output);
    } else {
      res.json(final_output);
    }
  };

  // end of function

  // category - men all women accesscories
  if (categories.includes(category)) {
    if (!paging) {
      res.redirect(`/api/1.0/products/${category}?paging=0`);
    } else {
      if (category === 'all') {
        products_sql = `select * from product limit 6 offset ${paging * 6};`;
      } else {
        products_sql = `select * from product where category ='${category}' limit 6 offset ${paging * 6};`;
      }
      const products = await query(products_sql);
      const productIds = [];

      for (p of products) {
        productIds.push(p.id);
      }
      await getJSONs(productIds, products);
    }
  } else if (category === 'details') {
    if (!queryId) {
      res.redirect(`/api/1.0/products/${category}?id=201807242301`);
    } else {
      products_sql = `select * from product where id = '${queryId}';`;
      const products = await query(products_sql);
      const productIds = [];

      for (p of products) {
        productIds.push(p.id);
      }
      await getJSONs(productIds, products);
    }
  } else if (category === 'search') {
    if (!keyword) {
      res.redirect(`/api/1.0/products/${category}?keyword=洋裝`);
    } else {
      products_sql = `select * from product where title like '%${keyword}%' ;`;
      const products = await query(products_sql);
      const productIds = [];

      for (p of products) {
        productIds.push(p.id);
      }
      await getJSONs(productIds, products);
    }
  }
});
module.exports = router;
