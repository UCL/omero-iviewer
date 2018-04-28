#
# Copyright (c) 2017 University of Dundee.
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.
#

from django.conf.urls import patterns
from django.conf.urls import url

import views
import views_fastmal

urlpatterns = patterns(
    'django.views.generic.simple',
    # general entry point for iviewer app
    url(r'^/?$', views.index, name='omero_iviewer_index'),
    url(r'^persist_rois/?$', views.persist_rois,
        name='omero_iviewer_persist_rois'),
    url(r'^image_data/(?P<image_id>[0-9]+)/$', views.image_data,
        name='omero_iviewer_image_data'),
    url(r'^save_projection/?$', views.save_projection,
        name='omero_iviewer_save_projection'),
    url(r'^well_images/?$', views.well_images,
        name='omero_iviewer_well_images'),
    url(r'^get_intensity/?$', views.get_intensity,
        name='omero_iviewer_get_intensity'),
    url(r'^shape_stats/?$', views.shape_stats,
        name='omero_iviewer_shape_stats'),
    url(r'^fastmal_data/(?P<dataset_id>[0-9]+)/$', views_fastmal.fastmal_data,
        name='omero_iviewer_fastmal_data'),
    url(r'^fastmal_roi_complete_tag/(?P<image_id>[0-9]+)/(?P<state>true|false)/$', 
        views_fastmal.fastmal_roi_complete_tag,
        name='omero_iviewer_fastmal_roi_complete_tag'),
    url(r'^fastmal_user/$', views_fastmal.fastmal_user, 
        name='omero_iviewer_fastmal_user'),
    url(r'^fastmal_shape_annotation/(?P<shape_id>[0-9]+)/(?P<key>.*?)/(?P<value_new>.*?)/$', 
        views_fastmal.fastmal_shape_annotation, 
        name='omero_iviewer_fastmal_shape_annotation'),
    url(r'^fastmal_shape_annotation/(?P<shape_id>[0-9]+)/(?P<key>.*?)/$', 
        views_fastmal.fastmal_shape_annotation, 
        name='omero_iviewer_fastmal_shape_annotation'))
