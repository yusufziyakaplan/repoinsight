# RepoInsight · GitHub Pages

Bu klasör, PHP sürümündeki arayüzü veritabanı gerektirmeyen statik site olarak sunar.

- index.html: arayüz ve tarayıcı etkileşimleri.
- data.json: Actions tarafından yenilenen depo verileri.
- scripts/update-data.mjs: GitHub Search API'den veriyi ve 7 günlük yıldız geçmişini üretir.
- ../.github/workflows/refresh-github-pages.yml: Veriyi 30 dakikada bir yeniler ve Pages'e yayınlar.

GitHub Actions, veriyi düzenli aralıklarla yeniler ve depoya kaydeder. Ziyaretçilerin tarayıcısı GitHub API'ye istek atmaz; API tokenı istemciye gönderilmez. İş akışı GitHub Actions sekmesinden elle de çalıştırılabilir.

Favoriler, açılmış depolar, tema ve dil seçimi tarayıcıda saklanır; arama ve filtreler URL içinde tutulur. 7 günlük yıldız artışı geçmişi ilk bir haftadan sonra görünür.

Diller arasında geçiş yapmak için üstteki EN / TR düğmesini kullan.

GitHub Pages ayarlarında Settings → Pages → Build and deployment → Source seçeneği GitHub Actions olmalıdır. İş akışı, bu deponun kökündeki github-pages/ klasörünü yayınlar.
